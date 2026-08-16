import type { DeckBackend, BackendEvent } from './DeckBackend';
import { STREAM_CAPS, type LoadedTrackInfo } from '../engine/types';
import type { TrackRef } from '@/services/tracks/TrackRef';

/**
 * Simulates a DRM streaming backend (Spotify / Apple Music full tracks): only
 * play/pause/seek/volume, positions come from a clock, nothing enters Web Audio.
 * Used when no real credentials are configured so the "Stream Deck" UX can be exercised.
 */
export class MockStreamBackend implements DeckBackend {
  readonly kind = 'mock-stream' as const;
  readonly capabilities = STREAM_CAPS;
  private subs = new Set<(e: BackendEvent) => void>();
  private _duration = 0;
  private startedAt = 0; // performance.now() when play started
  private basePos = 0;
  private playing = false;
  private timer: number | null = null;
  private volume = 1;
  private osc: OscillatorNode | null = null;
  private oscGain: GainNode | null = null;

  constructor(private ctx: AudioContext) {}

  get duration() {
    return this._duration;
  }

  async load(track: TrackRef, opts?: { onProgress?: (p: number, stage: string) => void }): Promise<LoadedTrackInfo> {
    if (track.kind !== 'mock-stream') throw new Error('MockStreamBackend only plays mock-stream tracks');
    opts?.onProgress?.(0.3, 'connecting');
    await new Promise((r) => setTimeout(r, 400));
    opts?.onProgress?.(0.8, 'buffering');
    await new Promise((r) => setTimeout(r, 300));
    this._duration = track.meta.durationSec ?? 200;
    this.basePos = 0;
    this.playing = false;
    opts?.onProgress?.(1, 'ready');
    this.emitPos();
    return { duration: this._duration, analysis: null };
  }

  unload() {
    this.pause();
    this._duration = 0;
    this.basePos = 0;
  }

  /** Very quiet placeholder tone so the mixer VU shows *something* for a mock stream. */
  private ensureTone() {
    if (this.osc) return;
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = 110;
    this.oscGain = this.ctx.createGain();
    this.oscGain.gain.value = 0;
    this.osc.connect(this.oscGain);
    this.oscGain.connect(this.ctx.destination);
    this.osc.start();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.startedAt = performance.now();
    this.ensureTone();
    this.oscGain?.gain.setTargetAtTime(0.02 * this.volume, this.ctx.currentTime, 0.05);
    this.timer = window.setInterval(() => {
      if (this.getPosition() >= this._duration) {
        this.pause();
        this.basePos = this._duration;
        this.emit({ type: 'ended' });
      }
      this.emitPos();
    }, 100);
    this.emit({ type: 'state', playing: true });
    this.emitPos();
  }

  pause() {
    if (!this.playing) return;
    this.basePos = this.getPosition();
    this.playing = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.oscGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.emit({ type: 'state', playing: false });
    this.emitPos();
  }

  seek(seconds: number) {
    this.basePos = Math.max(0, Math.min(this._duration, seconds));
    this.startedAt = performance.now();
    this.emitPos();
  }
  seekAt(seconds: number) {
    this.seek(seconds);
  }
  setRate() {}
  setNominalRate() {}
  setRateAt() {}
  rampRate() {}
  setVolume(v: number) {
    this.volume = v;
    if (this.playing) this.oscGain?.gain.setTargetAtTime(0.02 * v, this.ctx.currentTime, 0.05);
  }
  setLoop() {}
  setSlip() {}
  slipReturn() {}
  scratch() {}
  getPosition() {
    if (!this.playing) return this.basePos;
    return Math.min(this._duration, this.basePos + (performance.now() - this.startedAt) / 1000);
  }
  isPlaying() {
    return this.playing;
  }
  subscribe(cb: (e: BackendEvent) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  private emit(e: BackendEvent) {
    this.subs.forEach((s) => s(e));
  }
  private emitPos() {
    this.emit({
      type: 'position',
      seconds: this.getPosition(),
      ctxTime: this.ctx.currentTime,
      rate: this.playing ? 1 : 0,
      playing: this.playing,
      slipSeconds: this.getPosition(),
    });
  }
  dispose() {
    this.pause();
    try {
      this.osc?.stop();
      this.osc?.disconnect();
      this.oscGain?.disconnect();
    } catch {
      /* noop */
    }
    this.subs.clear();
  }
}
