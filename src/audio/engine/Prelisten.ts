import { create } from 'zustand';
import { AudioEngine } from './AudioEngine';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { isStreamTrack } from '@/services/tracks/TrackRef';
import { arrayBufferOf } from '@/services/tracks/bytes';

interface PrelistenState {
  trackId: string | null;
  loading: boolean;
  playing: boolean;
  position: number;
  duration: number;
}

export const usePrelisten = create<PrelistenState>(() => ({ trackId: null, loading: false, playing: false, position: 0, duration: 0 }));

/**
 * Library pre-listen (PFL): plays a track straight into the cue bus — headphones when a headphone
 * output is configured, otherwise it's blended into the master like a channel cue.
 * Decodes with the engine's context (no worklet, no analysis) so it starts fast.
 */
class PrelistenImpl {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private bufferId: string | null = null;
  private startCtx = 0;
  private startOffset = 0;
  private raf: number | null = null;
  private loadSeq = 0;

  get active() {
    return usePrelisten.getState().playing || usePrelisten.getState().loading;
  }

  async toggle(track: TrackRef, offsetFrac?: number) {
    const st = usePrelisten.getState();
    if (st.trackId === track.meta.id && (st.playing || st.loading)) {
      this.stop();
      return;
    }
    await this.play(track, offsetFrac);
  }

  async play(track: TrackRef, offsetFrac = 0) {
    if (isStreamTrack(track)) return; // DRM streams can't be decoded
    this.stopSource();
    const seq = ++this.loadSeq;
    usePrelisten.setState({ trackId: track.meta.id, loading: true, playing: false, position: 0, duration: track.meta.durationSec ?? 0 });
    AudioEngine.prelistenActive = true;
    this.pushCue();
    try {
      if (this.bufferId !== track.meta.id || !this.buffer) {
        const data = await arrayBufferOf(track);
        if (seq !== this.loadSeq) return;
        this.buffer = await AudioEngine.ctx.decodeAudioData(data);
        this.bufferId = track.meta.id;
      }
      if (seq !== this.loadSeq) return;
      this.startAt(Math.max(0, Math.min(0.98, offsetFrac)) * this.buffer.duration);
    } catch (e) {
      console.warn('[prelisten] failed', e);
      if (seq === this.loadSeq) this.stop();
    }
  }

  /** Seek within the current pre-listen (fraction 0..1). */
  seek(frac: number) {
    if (!this.buffer) return;
    this.startAt(Math.max(0, Math.min(0.999, frac)) * this.buffer.duration);
  }

  stop() {
    this.loadSeq++;
    this.stopSource();
    usePrelisten.setState({ trackId: null, loading: false, playing: false, position: 0 });
    AudioEngine.prelistenActive = false;
    this.pushCue();
  }

  private pushCue() {
    // re-apply the mixer so the fallback cue blend opens/closes
    AudioEngine.reapplyMixer();
  }

  private startAt(offset: number) {
    const ctx = AudioEngine.ctx;
    this.stopSource();
    if (!this.buffer) return;
    this.gain = ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(AudioEngine.master.cueInput);
    this.src = ctx.createBufferSource();
    this.src.buffer = this.buffer;
    this.src.connect(this.gain);
    this.src.onended = () => {
      if (usePrelisten.getState().playing) this.stop();
    };
    this.src.start(0, offset);
    this.startCtx = ctx.currentTime;
    this.startOffset = offset;
    usePrelisten.setState({ loading: false, playing: true, position: offset, duration: this.buffer.duration });
    const tick = () => {
      if (!this.src) return;
      const pos = this.startOffset + (ctx.currentTime - this.startCtx);
      usePrelisten.setState({ position: pos });
      this.raf = window.setTimeout(tick, 200);
    };
    tick();
  }

  private stopSource() {
    if (this.raf !== null) window.clearTimeout(this.raf);
    this.raf = null;
    if (this.src) {
      this.src.onended = null;
      try {
        this.src.stop();
      } catch {
        /* already stopped */
      }
      this.src.disconnect();
      this.src = null;
    }
    this.gain?.disconnect();
    this.gain = null;
  }

}

export const Prelisten = new PrelistenImpl();
