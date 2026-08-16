import type { DeckBackend } from '../backends/DeckBackend';
import { WebAudioBackend } from '../backends/WebAudioBackend';
import { MockStreamBackend } from '../backends/MockStreamBackend';
import { ChannelStrip } from './ChannelStrip';
import { HOT_CUE_COLORS, STREAM_CAPS, FULL_CAPS, type DeckId, type HotCue, type LoopInfo, type DeckSnapshot } from './types';
import { useDecks } from '@/store/decks';
import { deckRuntime } from '@/store/runtime';
import { isStreamTrack, type TrackRef } from '@/services/tracks/TrackRef';
import { beatLength, nearestBeat, quantize, type BeatGrid, nudgeGridTo, beatIndexAt, beatTime } from '../dsp/beatgrid';
import { getCues, putCues, addHistory } from '@/services/localLibrary/db';
import { clamp } from '../dsp/math';
import { useLibrary } from '@/store/library';

export type DeckEvent = { type: 'loaded' } | { type: 'ejected' } | { type: 'ended' } | { type: 'play' } | { type: 'pause' };

/**
 * A DJ deck: composes a playback backend + mixer channel strip + cue/loop/sync/pitch logic.
 * Slow state is mirrored into the Zustand store; positions go through the runtime channel.
 */
export class Deck {
  readonly strip: ChannelStrip;
  backend: DeckBackend;
  private webBackend: WebAudioBackend;
  private streamBackend: MockStreamBackend | null = null;
  private unsubBackend: (() => void) | null = null;
  private loadAbort: AbortController | null = null;
  private listeners = new Set<(e: DeckEvent) => void>();

  // transport/pitch state (authoritative here; mirrored to store)
  private pitch = 0;
  private pitchRange = 0.08;
  private baseRate = 1; // 1 + pitch*range
  private syncOffset = 0; // multiplicative correction from phase lock (~±2%)
  private reversed = false;
  private bendUntil = 0;
  private scratching = false;
  private cuePoint = 0;
  private cueHeld = false;
  private grid: BeatGrid | null = null;
  private loop: LoopInfo = { enabled: false, start: 0, end: 0 };
  private lastLoop: LoopInfo | null = null;
  private autoLoopBeats = 4;
  private hotCues: (HotCue | null)[] = new Array(8).fill(null);
  private slip = false;
  private quantizeOn = true;
  private trackId: string | null = null;
  private volumeThrottle = 0;
  private rolling = false;
  private censoring = false;

  constructor(readonly ctx: AudioContext, readonly id: DeckId, masterInput: AudioNode, cueBus: AudioNode) {
    this.strip = new ChannelStrip(ctx, id);
    this.strip.output.connect(masterInput);
    this.strip.cueTap.connect(cueBus);
    this.webBackend = new WebAudioBackend(ctx);
    this.backend = this.webBackend;
    this.attachBackend(this.webBackend);
  }

  /* ------------------------------ store helpers ------------------------------ */
  private patch(p: Partial<DeckSnapshot> | ((d: DeckSnapshot) => Partial<DeckSnapshot>)) {
    useDecks.getState().update(this.id, p);
  }
  get snapshot(): DeckSnapshot {
    return useDecks.getState().decks[this.id];
  }
  on(cb: (e: DeckEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(e: DeckEvent) {
    this.listeners.forEach((l) => l(e));
  }

  /* -------------------------------- backends -------------------------------- */
  private attachBackend(b: DeckBackend) {
    this.unsubBackend?.();
    this.backend = b;
    if (b.output) {
      try {
        b.output.disconnect();
      } catch {
        /* noop */
      }
      b.output.connect(this.strip.input);
    }
    this.unsubBackend = b.subscribe((e) => {
      switch (e.type) {
        case 'position':
          deckRuntime[this.id].set({ pos: e.seconds, ctxTime: e.ctxTime, rate: e.rate, playing: e.playing, slipPos: e.slipSeconds });
          break;
        case 'state':
          this.patch({ playing: e.playing });
          this.emit(e.playing ? { type: 'play' } : { type: 'pause' });
          break;
        case 'ended':
          this.patch({ playing: false });
          this.emit({ type: 'ended' });
          break;
        case 'error':
          this.patch({ error: e.error.message });
          break;
      }
    });
    this.patch({ capabilities: b.capabilities });
  }

  private backendFor(track: TrackRef): DeckBackend {
    if (isStreamTrack(track)) {
      if (!this.streamBackend) this.streamBackend = new MockStreamBackend(this.ctx);
      return this.streamBackend;
    }
    return this.webBackend;
  }

  get isStream() {
    return this.backend.kind !== 'webaudio';
  }

  /* --------------------------------- loading -------------------------------- */
  async load(track: TrackRef): Promise<void> {
    this.loadAbort?.abort();
    const abort = new AbortController();
    this.loadAbort = abort;

    // stop current
    this.backend.pause();
    this.setLoop({ enabled: false, start: 0, end: 0 });
    this.grid = null;
    this.hotCues = new Array(8).fill(null);
    this.cuePoint = 0;
    this.trackId = track.meta.id;
    const nb = this.backendFor(track);
    if (nb !== this.backend) {
      this.backend.unload();
      this.attachBackend(nb);
    }
    this.patch({
      track,
      loading: true,
      analyzing: true,
      analysisProgress: 0,
      error: null,
      playing: false,
      bpm: track.meta.bpm ?? 0,
      key: track.meta.key ?? '',
      keyName: '',
      grid: null,
      waveform: null,
      loop: { enabled: false, start: 0, end: 0 },
      hotCues: new Array(8).fill(null),
      cuePoint: 0,
      duration: track.meta.durationSec ?? 0,
      capabilities: nb.capabilities,
      sync: false,
    });
    deckRuntime[this.id].set({ pos: 0, ctxTime: this.ctx.currentTime, rate: 0, playing: false, slipPos: 0 });

    try {
      const info = await nb.load(track, {
        signal: abort.signal,
        onProgress: (p) => {
          if (!abort.signal.aborted) this.patch({ analysisProgress: p });
        },
      });
      if (abort.signal.aborted) return;
      const a = info.analysis;
      const saved = await getCues(track.meta.id);
      if (abort.signal.aborted) return;
      if (a) {
        this.grid = saved?.gridOverride
          ? { bpm: saved.gridOverride.bpm, firstBeatSec: saved.gridOverride.firstBeatSec }
          : a.bpm > 0
            ? { bpm: a.bpm, firstBeatSec: a.firstBeatSec }
            : null;
        this.strip.setTrimDb(a.gainDb);
        this.strip.fx.setTempo(a.bpm || 120);
      } else if (track.meta.bpm) {
        this.grid = null;
      }
      if (saved) {
        this.hotCues = saved.hotCues ?? this.hotCues;
        this.cuePoint = saved.cuePoint ?? 0;
      }
      this.applyRate();
      this.backend.setNominalRate(this.baseRate);
      this.backend.setSlip(this.slip);
      this.patch({
        loading: false,
        analyzing: false,
        analysisProgress: 1,
        duration: info.duration,
        bpm: a?.bpm || track.meta.bpm || 0,
        key: a?.key.camelot || track.meta.key || '',
        keyName: a?.key.name || '',
        grid: this.grid,
        waveform: a?.waveform ?? null,
        gainDb: a?.gainDb ?? 0,
        hotCues: [...this.hotCues],
        cuePoint: this.cuePoint,
      });
      addHistory({ trackId: track.meta.id, meta: track.meta, deck: this.id });
      if (a && track.kind === 'local') useLibrary.getState().updateLocalTrack(track.meta.id, { bpm: a.bpm || track.meta.bpm, key: a.key.camelot || track.meta.key, durationSec: info.duration });
      this.emit({ type: 'loaded' });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error(e);
      this.patch({ loading: false, analyzing: false, error: e?.message ?? 'Failed to load track', track: null });
    }
  }

  eject() {
    this.loadAbort?.abort();
    this.backend.pause();
    this.backend.unload();
    this.trackId = null;
    this.grid = null;
    useDecks.getState().reset(this.id);
    this.patch({ pitch: this.pitch, pitchRange: this.pitchRange, rate: this.baseRate, slip: this.slip, quantize: this.quantizeOn, capabilities: this.backend.capabilities });
    deckRuntime[this.id].set({ pos: 0, ctxTime: this.ctx.currentTime, rate: 0, playing: false, slipPos: 0 });
    this.emit({ type: 'ejected' });
  }

  get hasTrack() {
    return !!this.trackId;
  }
  get position() {
    return this.backend.getPosition();
  }
  get duration() {
    return this.backend.duration;
  }
  get playing() {
    return this.backend.isPlaying();
  }
  get beatGrid() {
    return this.grid;
  }
  get bpm() {
    return this.grid?.bpm ?? this.snapshot.bpm;
  }
  get rate() {
    return this.baseRate;
  }
  /** Effective BPM including pitch. */
  get effectiveBpm() {
    return this.bpm * this.baseRate;
  }

  /* -------------------------------- transport ------------------------------- */
  play() {
    if (!this.hasTrack) return;
    this.backend.play();
  }
  pause() {
    this.backend.pause();
  }
  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** VDJ-style CUE: playing → jump to cue & stop. paused → set cue at current pos (quantized). Hold to preview. */
  cuePress() {
    if (!this.hasTrack) return;
    if (this.playing && !this.cueHeld) {
      this.pause();
      this.seek(this.cuePoint);
      return;
    }
    // paused: set new cue at current position when not at cue
    const pos = this.position;
    if (Math.abs(pos - this.cuePoint) > 0.01) {
      this.cuePoint = quantize(this.grid, pos, this.quantizeOn);
      this.seek(this.cuePoint);
      this.patch({ cuePoint: this.cuePoint });
      this.persistCues();
    }
    this.cueHeld = true;
    this.play();
  }
  cueRelease() {
    if (!this.cueHeld) return;
    this.cueHeld = false;
    this.pause();
    this.seek(this.cuePoint);
  }
  /** Cue+Play (keep playing from cue point) */
  cuePlay() {
    this.cueHeld = false;
    this.seek(this.cuePoint);
    this.play();
  }

  seek(sec: number) {
    if (!this.hasTrack) return;
    this.backend.seek(clamp(sec, 0, this.duration));
  }

  /** Jump relative to grid so the deck stays in phase (used by quantized hot cues while playing). */
  private seekQuantized(sec: number) {
    if (this.playing && this.quantizeOn && this.grid) {
      // schedule the jump for the next beat boundary of *target*, keeping phase
      const now = this.position;
      const bl = beatLength(this.grid);
      const phaseNow = (now - this.grid.firstBeatSec) % bl;
      const phaseTarget = (sec - this.grid.firstBeatSec) % bl;
      const delta = phaseNow - phaseTarget; // move target so phases match
      let target = sec + delta;
      if (target < sec - bl / 2) target += bl;
      if (target > sec + bl / 2) target -= bl;
      this.backend.seek(Math.max(0, target));
    } else this.backend.seek(sec);
  }

  /* ---------------------------------- pitch --------------------------------- */
  private applyRate() {
    let r = this.baseRate * (1 + this.syncOffset);
    if (this.reversed) r = -r;
    if (this.censoring) r = -Math.abs(r);
    if (!this.scratching && !this.rolling) this.backend.setRate(r);
    this.backend.setNominalRate(this.baseRate);
    this.strip.fx.setTempo(this.effectiveBpm || 120);
    this.patch({ pitch: this.pitch, pitchRange: this.pitchRange, rate: this.baseRate });
  }
  setPitch(v: number) {
    this.pitch = clamp(v, -1, 1);
    this.baseRate = 1 + this.pitch * this.pitchRange;
    if (this.snapshot.sync) this.patch({ sync: false });
    this.applyRate();
  }
  setPitchRange(range: number) {
    // keep current rate if possible
    const rate = this.baseRate;
    this.pitchRange = range;
    this.pitch = clamp((rate - 1) / range, -1, 1);
    this.baseRate = 1 + this.pitch * this.pitchRange;
    this.applyRate();
  }
  /** Set the effective rate directly (sync). Expands range if needed. */
  setRateDirect(rate: number) {
    let p = (rate - 1) / this.pitchRange;
    if (Math.abs(p) > 1) {
      const ranges = [0.08, 0.16, 0.5, 1];
      const need = ranges.find((r) => Math.abs(rate - 1) <= r) ?? 1;
      this.pitchRange = need;
      p = (rate - 1) / need;
    }
    this.pitch = clamp(p, -1, 1);
    this.baseRate = 1 + this.pitch * this.pitchRange;
    this.applyRate();
  }
  setSyncOffset(o: number) {
    if (o === this.syncOffset) return;
    this.syncOffset = o;
    let r = this.baseRate * (1 + o);
    if (this.reversed) r = -r;
    if (!this.scratching && !this.rolling && !this.censoring) this.backend.setRate(r);
  }
  /** Temporary pitch bend (buttons / jog outer ring). amount ±1 => ±8% */
  bend(amount: number, ms = 120) {
    if (this.scratching) return;
    const r = this.baseRate * (1 + amount * 0.08) * (this.reversed ? -1 : 1);
    this.backend.rampRate(r, 0.02);
    const until = performance.now() + ms;
    this.bendUntil = until;
    setTimeout(() => {
      if (this.bendUntil === until && !this.scratching) this.backend.rampRate(this.baseRate * (1 + this.syncOffset) * (this.reversed ? -1 : 1), 0.05);
    }, ms);
  }
  setKeylock(on: boolean) {
    this.patch({ keylock: on });
    void this.backend.setKeylock?.(on);
  }
  private keyShift = 0;
  setKeyShift(semitones: number) {
    this.keyShift = Math.max(-12, Math.min(12, Math.round(semitones)));
    this.backend.setKeyShift?.(this.keyShift);
    this.patch({ keyShift: this.keyShift });
  }
  setReverse(on: boolean) {
    this.reversed = on;
    this.applyRate();
  }
  /** Censor: reverse while held with slip so playback continues from where it would have been. */
  censor(on: boolean) {
    if (on && !this.censoring) {
      this.censoring = true;
      const wasSlip = this.slip;
      this.backend.setSlip(true);
      this.backend.setRate(-this.baseRate);
      (this as any)._censorSlip = wasSlip;
    } else if (!on && this.censoring) {
      this.censoring = false;
      this.backend.setRate(this.baseRate * (1 + this.syncOffset) * (this.reversed ? -1 : 1));
      this.backend.slipReturn();
      if (!(this as any)._censorSlip) this.backend.setSlip(false);
    }
  }
  brake(seconds = 0.5) {
    if (!this.playing) return;
    this.backend.rampRate(0, seconds / 3);
    setTimeout(() => {
      this.pause();
      this.backend.setRate(this.baseRate * (this.reversed ? -1 : 1));
    }, seconds * 1000);
  }
  backspin(seconds = 0.9) {
    if (!this.hasTrack) return;
    const wasPlaying = this.playing;
    if (!wasPlaying) this.play();
    this.backend.setRateAt(-4);
    this.backend.rampRate(0, seconds / 3.5);
    setTimeout(() => {
      this.pause();
      this.backend.setRate(this.baseRate * (this.reversed ? -1 : 1));
    }, seconds * 1000);
  }

  /* ----------------------------------- jog ---------------------------------- */
  /** Vinyl-mode touch. */
  jogTouch(on: boolean) {
    if (!this.backend.capabilities.scratch) return;
    if (on && !this.scratching) {
      this.scratching = true;
      this.backend.scratch(true);
      this.backend.setRateAt(0);
    } else if (!on && this.scratching) {
      this.scratching = false;
      this.backend.rampRate(this.baseRate * (1 + this.syncOffset) * (this.reversed ? -1 : 1), 0.03);
      this.backend.scratch(false);
    }
  }
  /** Angular velocity in revolutions/sec from the platter → playback rate (33⅓ rpm = 1×). */
  jogScratch(revPerSec: number) {
    if (!this.scratching) return;
    const rate = clamp(revPerSec / (33.333 / 60), -8, 8);
    this.backend.rampRate(rate, 0.012);
  }
  /** Outer ring / non-vinyl nudge: small pitch bend proportional to velocity. */
  jogNudge(revPerSec: number) {
    if (this.scratching) return;
    const amt = clamp(revPerSec * 0.6, -1, 1);
    this.bend(amt, 80);
  }
  /** Scrub (drag on waveform): move playhead by delta seconds while paused, or scratch-like when playing. */
  scrub(deltaSec: number) {
    if (!this.hasTrack) return;
    this.seek(this.position + deltaSec);
  }

  /* -------------------------------- hot cues -------------------------------- */
  hotCuePress(i: number) {
    if (!this.hasTrack) return;
    const c = this.hotCues[i];
    if (c) {
      if (c.type === 'loop' && c.loopEnd !== undefined) {
        this.setLoop({ enabled: true, start: c.sec, end: c.loopEnd });
        this.seek(c.sec);
      } else this.seekQuantized(c.sec);
      if (!this.playing) {
        // preview while held (like cue)
        this.cueHeld = true;
        (this as any)._hotCueHeld = i;
        this.play();
      }
    } else {
      const sec = quantize(this.grid, this.position, this.quantizeOn);
      this.hotCues[i] = { index: i, sec, color: HOT_CUE_COLORS[i], type: 'cue' };
      this.patch({ hotCues: [...this.hotCues] });
      this.persistCues();
    }
  }
  hotCueRelease(i: number) {
    if ((this as any)._hotCueHeld === i && this.cueHeld) {
      this.cueHeld = false;
      (this as any)._hotCueHeld = undefined;
      const c = this.hotCues[i];
      this.pause();
      if (c) this.seek(c.sec);
    }
  }
  hotCueDelete(i: number) {
    this.hotCues[i] = null;
    this.patch({ hotCues: [...this.hotCues] });
    this.persistCues();
  }
  saveLoopToHotCue(i: number) {
    if (!this.loop.enabled) return;
    this.hotCues[i] = { index: i, sec: this.loop.start, loopEnd: this.loop.end, color: HOT_CUE_COLORS[i], type: 'loop' };
    this.patch({ hotCues: [...this.hotCues] });
    this.persistCues();
  }
  private persistCues() {
    if (!this.trackId) return;
    putCues({ trackId: this.trackId, hotCues: this.hotCues, cuePoint: this.cuePoint, gridOverride: this.grid ? { bpm: this.grid.bpm, firstBeatSec: this.grid.firstBeatSec } : null });
  }

  /* ---------------------------------- loops --------------------------------- */
  private setLoop(l: LoopInfo) {
    this.loop = l;
    this.backend.setLoop(l.enabled, l.start, l.end);
    if (l.enabled) this.lastLoop = l;
    this.patch({ loop: { ...l } });
  }
  loopIn() {
    const start = quantize(this.grid, this.position, this.quantizeOn);
    this.setLoop({ enabled: false, start, end: start });
  }
  loopOut() {
    const end = quantize(this.grid, this.position, this.quantizeOn);
    if (end <= this.loop.start + 0.005) return;
    this.setLoop({ enabled: true, start: this.loop.start, end });
    if (this.slip) this.backend.setSlip(true);
  }
  autoLoop(beats: number) {
    if (!this.hasTrack) return;
    this.autoLoopBeats = beats;
    this.patch({ autoLoopBeats: beats });
    const bl = this.grid ? beatLength(this.grid) : 60 / 120;
    const pos = this.position;
    const start = this.grid && this.quantizeOn ? nearestBeat(this.grid, pos, beats < 1 ? Math.round(1 / beats) : 1) : pos;
    const s = Math.max(0, Math.min(start, this.duration - bl * beats));
    this.setLoop({ enabled: true, start: s, end: s + bl * beats, beats });
    if (this.playing && pos < s) this.seek(s);
  }
  setAutoLoopBeats(beats: number) {
    this.autoLoopBeats = beats;
    this.patch({ autoLoopBeats: beats });
    if (this.loop.enabled) {
      const bl = this.grid ? beatLength(this.grid) : 60 / 120;
      const end = this.loop.start + bl * beats;
      this.setLoop({ ...this.loop, end, beats });
      if (this.position > end) this.seek(this.loop.start + ((this.position - this.loop.start) % (end - this.loop.start)));
    }
  }
  loopHalve() {
    this.setAutoLoopBeats(Math.max(1 / 32, this.autoLoopBeats / 2));
  }
  loopDouble() {
    this.setAutoLoopBeats(Math.min(64, this.autoLoopBeats * 2));
  }
  toggleLoop() {
    if (this.loop.enabled) this.exitLoop();
    else if (this.lastLoop) this.reloop();
    else this.autoLoop(this.autoLoopBeats);
  }
  exitLoop() {
    if (!this.loop.enabled) return;
    this.setLoop({ ...this.loop, enabled: false });
    if (this.slip) this.backend.slipReturn();
  }
  reloop() {
    if (!this.lastLoop) return;
    this.setLoop({ ...this.lastLoop, enabled: true });
    if (this.playing && (this.position < this.lastLoop.start || this.position > this.lastLoop.end)) this.seek(this.lastLoop.start);
  }
  /** Momentary loop roll: loop with slip on, return to shadow position on release. */
  loopRoll(beats: number, on: boolean) {
    if (on) {
      this.rolling = true;
      this.backend.setSlip(true);
      const bl = this.grid ? beatLength(this.grid) : 0.5;
      const pos = this.position;
      const start = this.grid ? nearestBeat(this.grid, pos, Math.max(1, Math.round(1 / Math.min(1, beats)))) : pos;
      this.setLoop({ enabled: true, start, end: start + bl * beats, beats });
    } else {
      this.rolling = false;
      this.setLoop({ ...this.loop, enabled: false });
      this.backend.slipReturn();
      if (!this.slip) this.backend.setSlip(false);
      this.applyRate();
    }
  }
  beatJump(beats: number) {
    if (!this.hasTrack) return;
    const bl = this.grid ? beatLength(this.grid) : 0.5;
    const target = this.position + beats * bl;
    if (this.loop.enabled) {
      const len = this.loop.end - this.loop.start;
      this.setLoop({ ...this.loop, start: this.loop.start + beats * bl, end: this.loop.start + beats * bl + len });
    }
    this.seek(clamp(target, 0, this.duration));
  }

  /* --------------------------------- toggles -------------------------------- */
  setSlip(on: boolean) {
    this.slip = on;
    this.backend.setSlip(on);
    this.patch({ slip: on });
  }
  setQuantize(on: boolean) {
    this.quantizeOn = on;
    this.patch({ quantize: on });
  }
  get quantize() {
    return this.quantizeOn;
  }

  /* --------------------------------- beatgrid ------------------------------- */
  setGrid(g: BeatGrid | null) {
    this.grid = g;
    this.patch({ grid: g, bpm: g?.bpm ?? this.snapshot.bpm });
    if (g) this.strip.fx.setTempo(g.bpm * this.baseRate);
    this.persistCues();
  }
  gridNudgeHere() {
    if (!this.grid) return;
    this.setGrid(nudgeGridTo(this.grid, this.position));
  }
  gridShift(ms: number) {
    if (!this.grid) return;
    this.setGrid({ ...this.grid, firstBeatSec: this.grid.firstBeatSec + ms / 1000 });
  }
  gridMultiply(f: number) {
    if (!this.grid) return;
    this.setGrid({ ...this.grid, bpm: Math.round(this.grid.bpm * f * 100) / 100 });
  }
  setBpm(bpm: number) {
    if (!bpm) return;
    this.setGrid({ bpm, firstBeatSec: this.grid?.firstBeatSec ?? 0 });
  }
  /** Set downbeat (bar start) at current position: shift firstBeat by whole beats. */
  setDownbeatHere() {
    if (!this.grid) return;
    const idx = Math.round(beatIndexAt(this.grid, this.position));
    this.setGrid({ ...this.grid, firstBeatSec: beatTime(this.grid, idx) });
  }

  /* --------------------------------- mixer/vol ------------------------------ */
  /** Called by the engine when fader/crossfader change to push volume to stream backends. */
  pushStreamVolume() {
    if (this.backend.kind === 'webaudio') return;
    const now = performance.now();
    if (now - this.volumeThrottle < 60) return;
    this.volumeThrottle = now;
    this.backend.setVolume(this.strip.effectiveVolume);
  }

  get capabilities() {
    return this.backend.capabilities;
  }
  static capsFor(track: TrackRef) {
    return isStreamTrack(track) ? STREAM_CAPS : FULL_CAPS;
  }

  captureSlice(startSec: number, endSec: number) {
    return this.backend.captureSlice?.(startSec, endSec) ?? Promise.resolve(null);
  }

  dispose() {
    this.unsubBackend?.();
    this.webBackend.dispose();
    this.streamBackend?.dispose();
  }
}
