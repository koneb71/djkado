import { MasterBus } from './MasterBus';
import { Deck } from './Deck';
import { Crossfader } from './Crossfader';
import { Sampler } from './Sampler';
import { Recorder } from './Recorder';
import { DECK_IDS, type DeckId } from './types';
import { useMixer } from '@/store/mixer';
import { useDecks } from '@/store/decks';
import { phaseDelta } from '../dsp/beatgrid';
import { clamp } from '../dsp/math';

/**
 * Singleton owner of the AudioContext, master bus, decks, crossfader, sampler and recorder.
 * Also runs the low-rate engine tick (sync phase-lock, meters) from the shared rAF loop.
 */
class AudioEngineImpl {
  private _ctx: AudioContext | null = null;
  private _master: MasterBus | null = null;
  private _decks: Partial<Record<DeckId, Deck>> = {};
  private _sampler: Sampler | null = null;
  private _recorder: Recorder | null = null;
  readonly crossfader = new Crossfader();
  private masterDeck: DeckId | null = null;
  private unlockListeners: (() => void)[] = [];
  private mixerUnsub: (() => void) | null = null;

  get isReady() {
    return !!this._ctx && this._ctx.state === 'running';
  }

  get ctx(): AudioContext {
    if (!this._ctx) this.init();
    return this._ctx!;
  }
  get master(): MasterBus {
    if (!this._master) this.init();
    return this._master!;
  }
  get sampler(): Sampler {
    if (!this._sampler) this.init();
    return this._sampler!;
  }
  get recorder(): Recorder {
    if (!this._recorder) this.init();
    return this._recorder!;
  }
  deck(id: DeckId): Deck {
    if (!this._decks[id]) this.init();
    return this._decks[id]!;
  }
  get decks(): Deck[] {
    return DECK_IDS.map((id) => this.deck(id));
  }

  private init() {
    if (this._ctx) return;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this._ctx = ctx;
    this._master = new MasterBus(ctx);
    for (const id of DECK_IDS) this._decks[id] = new Deck(ctx, id, this._master.input, this._master.cueInput);
    this._sampler = new Sampler(ctx, this._master.input);
    this._recorder = new Recorder(ctx, this._master);
    this.bindMixerStore();
    this.applyMixer(useMixer.getState());
    // stream volume push on fader / xf change
  }

  /** Must be called from a user gesture. */
  async ensureRunning(): Promise<boolean> {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const ok = ctx.state === 'running';
    if (ok) {
      this.unlockListeners.forEach((l) => l());
      this.unlockListeners = [];
    }
    return ok;
  }
  onUnlock(cb: () => void) {
    if (this.isReady) cb();
    else this.unlockListeners.push(cb);
  }

  /* --------------------------------- mixer --------------------------------- */
  private bindMixerStore() {
    this.mixerUnsub?.();
    this.mixerUnsub = useMixer.subscribe((s) => this.applyMixer(s));
  }

  private applyMixer(s: ReturnType<typeof useMixer.getState>) {
    if (!this._master) return;
    this.crossfader.position = s.crossfader;
    this.crossfader.curve = s.curve;
    this.crossfader.assign = s.assign;
    this._master.setMasterGain(s.master * s.master * 1.4); // 0.85 → ~1.0
    let anyCue = false;
    for (const id of DECK_IDS) {
      const d = this._decks[id]!;
      const c = s.channels[id];
      d.strip.setTrimDb(c.gain * 12 + (d.snapshot.gainDb || 0));
      d.strip.setEq('high', c.high);
      d.strip.setEq('mid', c.mid);
      d.strip.setEq('low', c.low);
      d.strip.setFilter(c.filter);
      d.strip.setFader(c.fader);
      d.strip.setXfGain(this.crossfader.gainFor(id));
      d.strip.setCue(c.cue);
      if (c.cue) anyCue = true;
      d.pushStreamVolume();
    }
    // Without a dedicated headphone output we blend cue into master when cueMix < 1 and any cue is active
    this._master.cueInput.gain.setTargetAtTime(anyCue ? (1 - s.cueMix) * s.cueVolume * 0.6 : 0, this.ctx.currentTime, 0.02);
  }

  /* ---------------------------------- sync ---------------------------------- */
  getMasterDeck(): Deck | null {
    if (this.masterDeck && this.deck(this.masterDeck).hasTrack) return this.deck(this.masterDeck);
    // auto: playing deck with highest fader
    let best: Deck | null = null;
    let bestScore = -1;
    for (const d of this.decks) {
      if (!d.hasTrack || !d.playing || !d.beatGrid) continue;
      const score = d.strip.faderValue * d.strip.xfValue + 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  setMasterDeck(id: DeckId | null) {
    this.masterDeck = id;
    for (const d of this.decks) useDecks.getState().update(d.id, { isMaster: d.id === id });
  }

  /** Toggle sync on a deck: match tempo now + phase; then continuous phase lock in tick(). */
  toggleSync(id: DeckId) {
    const d = this.deck(id);
    const on = !d.snapshot.sync;
    if (!on) {
      d.setSyncOffset(0);
      useDecks.getState().update(id, { sync: false });
      return;
    }
    let master = this.getMasterDeck();
    if (!master || master.id === id) {
      // pick another deck with a track & grid
      master = this.decks.find((x) => x.id !== id && x.hasTrack && x.beatGrid) ?? null;
    }
    if (!master || !d.beatGrid || !master.beatGrid) {
      // nothing to sync to → this deck becomes master
      this.setMasterDeck(id);
      useDecks.getState().update(id, { sync: true });
      return;
    }
    if (!this.masterDeck) this.setMasterDeck(master.id);
    d.setRateDirect((master.effectiveBpm) / d.bpm);
    useDecks.getState().update(id, { sync: true });
    // phase align now
    const delta = phaseDelta(master.beatGrid, master.position, d.beatGrid, d.position);
    if (Math.abs(delta) > 0.002) {
      if (d.playing) d.seek(d.position + delta);
      else d.seek(d.position + delta);
    }
  }

  private syncTick() {
    const master = this.getMasterDeck();
    if (!master || !master.beatGrid) return;
    for (const d of this.decks) {
      if (d.id === master.id || !d.snapshot.sync || !d.beatGrid || !d.playing || !master.playing) {
        if (d.id !== master.id) d.setSyncOffset(0);
        continue;
      }
      // tempo follow (in case master pitch changed)
      const want = master.effectiveBpm / d.bpm;
      if (Math.abs(want - d.rate) > 0.0005) d.setRateDirect(want);
      const delta = phaseDelta(master.beatGrid, master.position, d.beatGrid, d.position);
      if (Math.abs(delta) > 0.06) {
        d.seek(d.position + delta);
        d.setSyncOffset(0);
      } else {
        // proportional nudge, max ±2%
        d.setSyncOffset(clamp(delta * 1.5, -0.02, 0.02));
      }
    }
    // master decks: pushed sync flag stays true so tempo follows when master pitch moves
  }

  private syncTimer: number | null = null;

  /** Called from the shared rAF loop (meters only — rAF pauses when the window is hidden). */
  tick(_now: number) {
    if (!this._ctx || !this._master) return;
    this._master.updateMeters();
    for (const id of DECK_IDS) this._decks[id]!.strip.updateMeter();
    if (this.syncTimer === null) {
      // sync phase-lock on a timer so it keeps correcting while minimized / in the background
      this.syncTimer = window.setInterval(() => this.syncTick(), 50);
    }
  }
}

export const AudioEngine = new AudioEngineImpl();
