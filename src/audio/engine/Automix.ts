import { toast } from 'sonner';
import { AudioEngine } from './AudioEngine';
import type { Deck } from './Deck';
import type { DeckId } from './types';
import { useMixer } from '@/store/mixer';
import { useAutomix } from '@/store/automix';
import { useCrates } from '@/store/crates';
import { findTrack } from '@/services/tracks/registry';
import { clamp } from '../dsp/math';

/**
 * Auto DJ: plays the queue on decks A/B, preloads the next track into the idle deck, and mixes
 * beat-matched over N bars (crossfader + optional bass swap) when the live track nears its end.
 * The user stays in control: touching play/xfader while mixing is allowed; disabling stops the ramp.
 */
type Mix = {
  from: DeckId;
  to: DeckId;
  t0: number; // ctx time
  dur: number;
  useXf: boolean;
  xf0: number;
  xf1: number;
  synced: boolean;
};

const DECKS: DeckId[] = ['A', 'B'];
const TICK_MS = 60;

class AutomixImpl {
  private timer: number | null = null;
  private mix: Mix | null = null;
  private loading: DeckId | null = null;
  /** decks whose current track already played through the mix (don't play them again) */
  private played = new Set<DeckId>();
  /** decks Automix loaded + cued itself (safe to auto-start) */
  private prepared = new Set<DeckId>();
  private unsubs: (() => void)[] = [];
  private glide: { deck: DeckId; from: number; t0: number; dur: number } | null = null;

  start() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    for (const id of DECKS) {
      const dk = AudioEngine.deck(id);
      this.unsubs.push(
        dk.on((e) => {
          if (e.type === 'loaded' && this.loading !== id) {
            // user loaded something → eligible again
            this.played.delete(id);
            this.prepared.delete(id);
          }
          if (e.type === 'ejected') {
            this.played.delete(id);
            this.prepared.delete(id);
          }
          if (e.type === 'ended') this.played.add(id); // ran out → never replay it
        }),
      );
    }
    useAutomix.getState()._status({ phase: 'idle', progress: 0, countdown: null });
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.mix) this.finishMix(false);
    this.glide = null;
    this.loading = null;
    this.played.clear();
    this.prepared.clear();
    useAutomix.getState()._status({ phase: 'off', liveDeck: null, nextDeck: null, progress: 0, countdown: null });
  }

  /** Skip: start the transition now (or hard-cut when the next deck isn't ready). */
  skip() {
    const live = this.liveDeck();
    if (!live) {
      // nothing playing (user paused a track): give it up and let the queue continue
      for (const id of DECKS) if (this.isReady(AudioEngine.deck(id)) && !this.prepared.has(id)) this.played.add(id);
      return;
    }
    const next = this.otherDeck(live.id);
    if (this.mix) {
      this.finishMix(true);
      return;
    }
    if (this.isReady(next)) this.startMix(live, next);
  }

  private liveDeck(): Deck | null {
    let best: Deck | null = null;
    let score = -1;
    for (const id of DECKS) {
      const d = AudioEngine.deck(id);
      if (!d.hasTrack || !d.playing) continue;
      const s = d.strip.faderValue * d.strip.xfValue + (this.mix?.to === id ? -0.5 : 0) + 0.001;
      if (s > score) {
        score = s;
        best = d;
      }
    }
    return best;
  }
  private otherDeck(id: DeckId): Deck {
    return AudioEngine.deck(id === 'A' ? 'B' : 'A');
  }
  private isReady(d: Deck) {
    return d.hasTrack && !d.snapshot.loading && !d.snapshot.analyzing && !this.played.has(d.id) && this.loading !== d.id;
  }

  private xfSideOf(id: DeckId): number | null {
    const a = useMixer.getState().assign[id];
    return a === 'A' ? -1 : a === 'B' ? 1 : null;
  }

  private tick() {
    const st = useAutomix.getState();
    if (!st.enabled) return;
    const now = AudioEngine.ctx.currentTime;

    if (this.glide) {
      const g = this.glide;
      const k = clamp((now - g.t0) / g.dur, 0, 1);
      const d = AudioEngine.deck(g.deck);
      if (!d.snapshot.sync) d.setRateDirect(g.from + (1 - g.from) * k);
      if (k >= 1) {
        if (!d.snapshot.sync) d.setPitch(0);
        this.glide = null;
      }
    }

    if (this.mix) {
      this.tickMix(now);
      return;
    }

    const live = this.liveDeck();
    if (!live) {
      // nothing playing: start a loaded-but-idle deck, else pull from the queue
      const candidate = DECKS.map((id) => AudioEngine.deck(id)).find((d) => this.isReady(d));
      if (candidate) {
        if (this.prepared.has(candidate.id) || candidate.position < 0.5) {
          this.cueToStart(candidate);
          this.prepared.delete(candidate.id);
          this.setXfTo(candidate.id);
          candidate.play({ instant: true });
          st._status({ phase: 'idle', liveDeck: candidate.id, nextDeck: null, countdown: null });
        } else {
          // user paused mid-track: wait for them (Skip moves on)
          st._status({ phase: 'idle', liveDeck: null, nextDeck: candidate.id, countdown: null });
        }
        return;
      }
      if (this.loading) {
        st._status({ phase: 'loading', nextDeck: this.loading });
        return;
      }
      const target = DECKS.map((id) => AudioEngine.deck(id)).find((d) => !d.hasTrack) ?? AudioEngine.deck('A');
      if (!this.loadNext(target.id)) st._status({ phase: 'empty', liveDeck: null, nextDeck: null, countdown: null });
      return;
    }

    const next = this.otherDeck(live.id);
    // preload
    if (!this.isReady(next) && this.loading !== next.id && (!next.hasTrack || this.played.has(next.id)) && !next.playing) {
      if (!this.loadNext(next.id)) {
        st._status({ phase: 'empty', liveDeck: live.id, nextDeck: null, countdown: null });
      }
    }
    if (this.loading === next.id) {
      st._status({ phase: 'loading', liveDeck: live.id, nextDeck: next.id, countdown: null });
      return;
    }
    if (!this.isReady(next)) return;

    // when to mix
    const rate = Math.abs(live.rate) || 1;
    const remaining = (live.duration - live.position) / rate;
    const mixSec = this.mixSeconds(live);
    const countdown = remaining - mixSec;
    st._status({ phase: 'ready', liveDeck: live.id, nextDeck: next.id, countdown: Math.max(0, countdown) });
    if (countdown <= 0.05) this.startMix(live, next);
  }

  private mixSeconds(live: Deck) {
    const bars = useAutomix.getState().mixBars;
    const bpm = live.effectiveBpm || 120;
    const sec = (bars * 4 * 60) / bpm;
    // never longer than a third of the track
    return Math.min(sec, Math.max(4, live.duration / 3));
  }

  private loadNext(deckId: DeckId): boolean {
    const crates = useCrates.getState();
    // find the first resolvable item; drop missing ones
    let item = crates.shiftQueue();
    while (item) {
      const track = findTrack(item.trackId);
      if (track) {
        const d = AudioEngine.deck(deckId);
        this.loading = deckId;
        this.played.delete(deckId);
        useAutomix.getState()._status({ phase: 'loading', nextDeck: deckId });
        void d
          .load(track)
          .then(() => {
            if (this.loading === deckId) {
              this.loading = null;
              this.cueToStart(d);
              this.prepared.add(deckId);
            }
          })
          .catch(() => {
            if (this.loading === deckId) this.loading = null;
            this.played.add(deckId);
          });
        return true;
      }
      toast.warning(`Skipped “${item.meta.title}” — file not in the library`);
      item = crates.shiftQueue();
    }
    return false;
  }

  private cueToStart(d: Deck) {
    if (d.playing) return;
    const s = d.snapshot;
    const start = useAutomix.getState().startAtCue && s.cuePoint > 0 ? s.cuePoint : (d.beatGrid?.firstBeatSec ?? 0);
    d.seek(Math.max(0, start));
  }

  private setXfTo(id: DeckId) {
    const side = this.xfSideOf(id);
    const m = useMixer.getState();
    if (side !== null) m.setCrossfader(side);
    if (m.channels[id].fader < 0.5) m.setChannel(id, { fader: 1 });
  }

  private startMix(from: Deck, to: Deck) {
    const st = useAutomix.getState();
    const mixer = useMixer.getState();
    const dur = this.mixSeconds(from);
    // tempo-match + phase-align via the sync engine (keeps locking during the mix)
    let synced = false;
    if (st.beatmatch && from.beatGrid && to.beatGrid && from.bpm > 0 && to.bpm > 0) {
      const ratio = from.effectiveBpm / to.bpm;
      if (ratio > 0.8 && ratio < 1.25) {
        AudioEngine.setMasterDeck(from.id);
        if (!to.snapshot.sync) AudioEngine.toggleSync(to.id);
        // toggleSync aligned phase; make sure the incoming track starts on a bar-friendly beat
        synced = true;
      }
    }
    // incoming channel: fader up, low EQ where the bass swap wants it
    mixer.setChannel(to.id, { fader: 1, ...(st.bassSwap ? { low: -1 } : {}) });
    const sFrom = this.xfSideOf(from.id);
    const sTo = this.xfSideOf(to.id);
    const useXf = sFrom !== null && sTo !== null && sFrom !== sTo;
    if (!useXf) {
      // same side / thru → ramp the channel faders instead
      mixer.setChannel(to.id, { fader: 0 });
      mixer.setChannel(from.id, { fader: 1 });
    }
    this.prepared.delete(to.id);
    to.play({ instant: true }); // a beat-matched mix can't start with the platter spinning up
    this.mix = { from: from.id, to: to.id, t0: AudioEngine.ctx.currentTime, dur, useXf, xf0: useXf ? mixer.crossfader : 0, xf1: useXf ? sTo! : 0, synced };
    st._status({ phase: 'mixing', liveDeck: from.id, nextDeck: to.id, progress: 0, countdown: 0 });
  }

  private tickMix(now: number) {
    const m = this.mix!;
    const k = clamp((now - m.t0) / m.dur, 0, 1);
    const st = useAutomix.getState();
    const mixer = useMixer.getState();
    // equal-power feel on the crossfader path; the strip's curve does the rest
    if (m.useXf) mixer.setCrossfader(m.xf0 + (m.xf1 - m.xf0) * k);
    else {
      mixer.setChannel(m.from, { fader: 1 - k });
      mixer.setChannel(m.to, { fader: k });
    }
    if (st.bassSwap) {
      // first half: outgoing bass leaves; second half: incoming bass arrives
      const outLow = k < 0.5 ? -(k / 0.5) : -1;
      const inLow = k < 0.5 ? -1 : -(1 - (k - 0.5) / 0.5);
      mixer.setChannel(m.from, { low: outLow });
      mixer.setChannel(m.to, { low: inLow });
    }
    st._status({ progress: k });
    const from = AudioEngine.deck(m.from);
    if (k >= 1 || !from.playing) this.finishMix(true);
  }

  private finishMix(complete: boolean) {
    const m = this.mix;
    if (!m) return;
    this.mix = null;
    const mixer = useMixer.getState();
    const from = AudioEngine.deck(m.from);
    const to = AudioEngine.deck(m.to);
    if (complete) {
      if (m.useXf) mixer.setCrossfader(m.xf1);
      else mixer.setChannel(m.to, { fader: 1 });
      from.pause({ instant: true });
      this.played.add(m.from);
    }
    // restore EQ / faders on both channels
    mixer.setChannel(m.from, { low: 0, fader: 1 });
    mixer.setChannel(m.to, { low: 0 });
    // hand tempo control to the incoming deck; glide it back to its own tempo
    if (m.synced) {
      AudioEngine.setMasterDeck(m.to);
      if (to.snapshot.sync) AudioEngine.toggleSync(m.to);
      if (from.snapshot.sync) AudioEngine.toggleSync(m.from);
      const r = to.rate;
      if (Math.abs(r - 1) > 0.001) this.glide = { deck: m.to, from: r, t0: AudioEngine.ctx.currentTime, dur: Math.max(4, m.dur) };
    }
    useAutomix.getState()._status({ phase: 'idle', liveDeck: m.to, nextDeck: null, progress: 0, countdown: null });
  }
}

export const Automix = new AutomixImpl();

// Enable/disable follows the store; UI just flips `enabled`.
let wasEnabled = false;
useAutomix.subscribe((s) => {
  if (s.enabled === wasEnabled) return;
  wasEnabled = s.enabled;
  if (s.enabled) Automix.start();
  else Automix.stop();
});
