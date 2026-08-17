import type { DeckBackend, BackendEvent } from './DeckBackend';
import { FULL_CAPS, type LoadedTrackInfo } from '../engine/types';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { AnalysisQueue } from '../workers/AnalysisQueue';
import deckPlayerUrl from '../worklets/deck-player.worklet.ts?worker&url';
import { resampleTo } from '../stems/resample';

type StretchNode = AudioNode & {
  start: () => void;
  stop: () => void;
  schedule: (o: Record<string, unknown>) => void;
  configure: (o: Record<string, unknown>) => void;
  latency: () => number;
};
let stretchFactory: Promise<(ctx: AudioContext, opts?: any) => Promise<StretchNode>> | null = null;
/**
 * signalsmith-stretch builds its AudioWorklet from Function.toString() of its Emscripten module,
 * which bundlers/minifiers can break — so we serve the untouched .mjs from /vendor and import by URL.
 */
function loadStretch() {
  if (!stretchFactory) {
    const url = `${import.meta.env.BASE_URL}vendor/SignalsmithStretch.mjs`;
    stretchFactory = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`stretch module ${r.status}`);
        return r.text();
      })
      .then((code) => import(/* @vite-ignore */ URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))))
      .then((m: any) => m.default ?? m.SignalsmithStretch ?? m);
  }
  return stretchFactory;
}

let workletLoaded: Promise<void> | null = null;
export function loadDeckPlayerWorklet(ctx: AudioContext) {
  if (!workletLoaded) {
    workletLoaded = ctx.audioWorklet.addModule(deckPlayerUrl).catch((e) => {
      workletLoaded = null;
      throw e;
    });
  }
  return workletLoaded;
}

/**
 * Full-featured deck backend: decodes to PCM, streams from an AudioWorklet with
 * variable/negative rate, loops, slip, sample-accurate seeks. Feeds the ChannelStrip.
 */
export class WebAudioBackend implements DeckBackend {
  readonly kind = 'webaudio' as const;
  readonly capabilities = FULL_CAPS;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private subs = new Set<(e: BackendEvent) => void>();
  private srcRate = 44100;
  private _duration = 0;
  private lastPos = 0; // seconds
  private lastCtxTime = 0;
  private lastRate = 0;
  private playing = false;
  private slipPos = 0;
  private captureId = 0;
  private captureWaiters = new Map<number, (b: AudioBuffer | null) => void>();
  private ready: Promise<void>;
  private trackId: string | null = null;
  private stretch: StretchNode | null = null;
  private stretchLoading: Promise<void> | null = null;
  private keylock = false;
  private keyShift = 0; // semitones
  private targetRate = 1;
  private length = 0; // frames in the worklet
  private stemsWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;

  constructor(private ctx: AudioContext) {
    this.output = ctx.createGain();
    this.ready = loadDeckPlayerWorklet(ctx).then(() => {
      this.node = new AudioWorkletNode(ctx, 'deck-player', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.node.port.onmessage = (e) => this.onMessage(e.data);
      this.node.connect(this.output);
    });
  }

  get duration() {
    return this._duration;
  }

  private onMessage(msg: any) {
    switch (msg.type) {
      case 'pos': {
        this.lastPos = msg.pos / this.srcRate;
        this.slipPos = msg.slipPos / this.srcRate;
        this.lastCtxTime = msg.ctxTime;
        this.lastRate = msg.rate;
        const wasPlaying = this.playing;
        this.playing = msg.playing;
        this.emit({ type: 'position', seconds: this.lastPos, ctxTime: msg.ctxTime, rate: msg.rate, playing: msg.playing, slipSeconds: this.slipPos });
        if (wasPlaying !== msg.playing) this.emit({ type: 'state', playing: msg.playing });
        break;
      }
      case 'ended':
        this.playing = false;
        this.emit({ type: 'ended' });
        this.emit({ type: 'state', playing: false });
        break;
      case 'loopWrap':
        this.emit({ type: 'loopWrap' });
        break;
      case 'loaded':
        this.length = msg.length;
        break;
      case 'stemsSet':
        this.stemsWaiter?.resolve();
        this.stemsWaiter = null;
        break;
      case 'stemsError':
        this.stemsWaiter?.reject(new Error(msg.message));
        this.stemsWaiter = null;
        break;
      case 'capture': {
        const w = this.captureWaiters.get(msg.id);
        if (w) {
          this.captureWaiters.delete(msg.id);
          const chans: ArrayBuffer[] = msg.channels;
          if (!chans.length || new Float32Array(chans[0]).length === 0) w(null);
          else {
            const buf = this.ctx.createBuffer(chans.length, new Float32Array(chans[0]).length, msg.sampleRate);
            chans.forEach((c, i) => buf.copyToChannel(new Float32Array(c), i));
            w(buf);
          }
        }
        break;
      }
    }
  }

  private emit(e: BackendEvent) {
    this.subs.forEach((s) => s(e));
  }

  private post(msg: any, transfer?: Transferable[]) {
    if (!this.node) return;
    if (transfer) this.node.port.postMessage(msg, transfer);
    else this.node.port.postMessage(msg);
  }

  async load(track: TrackRef, opts?: { signal?: AbortSignal; onProgress?: (p: number, stage: string) => void }): Promise<LoadedTrackInfo> {
    await this.ready;
    const onProgress = opts?.onProgress;
    onProgress?.(0.02, 'reading');
    let arrayBuffer: ArrayBuffer;
    if (track.kind === 'local') arrayBuffer = await track.file.arrayBuffer();
    else if (track.kind === 'demo' || track.kind === 'apple-preview') {
      const url = track.kind === 'demo' ? track.url : track.previewUrl;
      const res = await fetch(url, { signal: opts?.signal });
      if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
      arrayBuffer = await res.arrayBuffer();
    } else throw new Error(`WebAudioBackend cannot play ${track.kind}`);
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    onProgress?.(0.1, 'decoding');
    const audio = await this.ctx.decodeAudioData(arrayBuffer);
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    this.srcRate = audio.sampleRate;
    this._duration = audio.duration;
    this.trackId = track.meta.id;

    // mono downmix for analysis (transferred to worker)
    const n = audio.length;
    const mono = new Float32Array(n);
    const nCh = audio.numberOfChannels;
    for (let c = 0; c < nCh; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / nCh;
    }
    // channel copies for the worklet (transferred: no extra retained copy on main thread)
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, nCh); c++) {
      const d = new Float32Array(n);
      d.set(audio.getChannelData(c));
      channels.push(d);
    }
    this.length = n;
    this.post({ type: 'load', channels: channels.map((c) => c.buffer), sampleRate: audio.sampleRate }, channels.map((c) => c.buffer));
    this.lastPos = 0;
    this.lastCtxTime = this.ctx.currentTime;
    this.lastRate = 0;
    this.playing = false;
    onProgress?.(0.2, 'analyzing');

    let analysis = null;
    try {
      // watchdog: never let a stuck/slow analysis block the deck (track stays playable without a grid)
      analysis = await Promise.race([
        AnalysisQueue.analyze(track.meta.id, mono, audio.sampleRate, 'high', (p, s) => onProgress?.(0.2 + p * 0.8, s)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 90_000)),
      ]);
      if (!analysis) console.warn('analysis timed out — continuing without beatgrid');
    } catch (e) {
      console.warn('analysis failed', e);
    }
    return { duration: audio.duration, sampleRate: audio.sampleRate, analysis };
  }

  unload() {
    this.post({ type: 'unload' });
    this._duration = 0;
    this.trackId = null;
    this.playing = false;
  }

  play() {
    this.post({ type: 'play' });
  }
  pause() {
    this.post({ type: 'pause' });
  }
  seek(seconds: number) {
    const s = Math.max(0, Math.min(this._duration, seconds));
    this.post({ type: 'seek', pos: s * this.srcRate });
    this.lastPos = s;
    this.lastCtxTime = this.ctx.currentTime;
  }
  seekAt(seconds: number, ctxTime: number) {
    this.post({ type: 'seekAtTime', pos: Math.max(0, Math.min(this._duration, seconds)) * this.srcRate, ctxTime });
  }
  private rateParam(): AudioParam | undefined {
    return this.node?.parameters.get('rate');
  }
  setRate(rate: number) {
    const p = this.rateParam();
    if (!p) return;
    p.cancelScheduledValues(this.ctx.currentTime);
    p.setTargetAtTime(rate, this.ctx.currentTime, 0.005);
    this.noteRate(rate);
  }
  setRateAt(rate: number, ctxTime?: number) {
    const p = this.rateParam();
    if (!p) return;
    p.setValueAtTime(rate, ctxTime ?? this.ctx.currentTime);
    this.noteRate(rate);
  }
  rampRate(target: number, timeConstant: number) {
    const p = this.rateParam();
    if (!p) return;
    p.cancelScheduledValues(this.ctx.currentTime);
    p.setTargetAtTime(target, this.ctx.currentTime, timeConstant);
    this.noteRate(target);
  }

  /* ------------------------------ key lock ------------------------------ */
  private noteRate(rate: number) {
    this.targetRate = rate;
    this.updateStretch();
  }
  private updateStretch() {
    if (!this.stretch) return;
    const r = Math.abs(this.targetRate);
    // compensate the resampling pitch change while within a musical range; bypass shift when scratching/braking
    const comp = this.keylock && r > 0.5 && r < 2 ? -12 * Math.log2(r) : 0;
    this.stretch.schedule({ semitones: comp + this.keyShift });
  }
  /** Master tempo: pitch-shift back by the resampling amount using a live-input stretch node. */
  async setKeylock(on: boolean) {
    this.keylock = on;
    if (on && !this.stretch) {
      if (!this.stretchLoading) {
        this.stretchLoading = (async () => {
          const factory = await loadStretch();
          const node = await factory(this.ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
          node.configure({ blockMs: 60, intervalMs: 15 });
          this.stretch = node;
        })().catch((e) => {
          console.warn('key lock unavailable', e);
          this.stretchLoading = null;
        });
      }
      await this.stretchLoading;
    }
    this.rewire();
  }
  setKeyShift(semitones: number) {
    this.keyShift = semitones;
    if (semitones !== 0 && !this.stretch) void this.setKeylock(this.keylock).then(() => this.rewire());
    this.updateStretch();
    this.rewire();
  }
  get stretchLatency(): number {
    if (!this.stretch || !(this.keylock || this.keyShift)) return 0;
    const l = this.stretch.latency?.();
    return typeof l === 'number' && isFinite(l) ? l : 0;
  }
  private rewire() {
    if (!this.node) return;
    try {
      this.node.disconnect();
    } catch {
      /* noop */
    }
    const useStretch = !!this.stretch && (this.keylock || this.keyShift !== 0);
    if (useStretch && this.stretch) {
      try {
        this.stretch.disconnect();
      } catch {
        /* noop */
      }
      this.node.connect(this.stretch);
      this.stretch.connect(this.output);
      this.stretch.start();
      this.updateStretch();
    } else {
      this.stretch?.stop();
      this.node.connect(this.output);
    }
  }
  setNominalRate(rate: number) {
    this.post({ type: 'setNominalRate', rate });
  }
  setVolume(_v: number) {
    /* handled by ChannelStrip nodes */
  }
  setLoop(enabled: boolean, startSec?: number, endSec?: number) {
    this.post({
      type: 'setLoop',
      enabled,
      start: startSec !== undefined ? startSec * this.srcRate : undefined,
      end: endSec !== undefined ? endSec * this.srcRate : undefined,
    });
  }
  setSlip(enabled: boolean) {
    this.post({ type: 'setSlip', enabled });
  }
  slipReturn() {
    this.post({ type: 'slipReturn' });
  }
  scratch(on: boolean) {
    this.post({ type: 'scratch', on });
  }
  getPosition(): number {
    if (!this.playing || this.lastRate === 0) return this.lastPos;
    return Math.max(0, Math.min(this._duration, this.lastPos + (this.ctx.currentTime - this.lastCtxTime) * this.lastRate));
  }
  isPlaying() {
    return this.playing;
  }
  subscribe(cb: (e: BackendEvent) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  /* --------------------------------- stems --------------------------------- */
  /** Attach stems; resamples to the worklet's rate/length when the source was decoded at a different rate. */
  async setStems(data: { stems: Int16Array[][]; scales: number[]; sampleRate: number; length: number }): Promise<void> {
    if (!this.node || !this.trackId) throw new Error('No track loaded');
    const targetLen = this.length;
    const needResample = data.length !== targetLen || data.sampleRate !== this.srcRate;
    const stems: Int16Array[][] = data.stems.map((chs) =>
      chs.map((ch) => {
        if (!needResample) return ch.slice(); // copy: the caller may keep its buffers (IDB cache)
        const f = new Float32Array(ch.length);
        for (let i = 0; i < ch.length; i++) f[i] = ch[i];
        const r = resampleTo(f, targetLen);
        const out = new Int16Array(targetLen);
        for (let i = 0; i < targetLen; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(r[i])));
        return out;
      }),
    );
    await new Promise<void>((resolve, reject) => {
      this.stemsWaiter = { resolve, reject };
      this.post({ type: 'setStems', channels: stems.map((chs) => chs.map((c) => c.buffer)), scale: data.scales }, stems.flat().map((c) => c.buffer));
      setTimeout(() => {
        if (this.stemsWaiter?.resolve === resolve) {
          this.stemsWaiter = null;
          reject(new Error('stems attach timed out'));
        }
      }, 5000);
    });
  }
  setStemGains(gains: number[], active: boolean) {
    this.post({ type: 'setStemGains', gains, active });
  }
  clearStems() {
    this.post({ type: 'clearStems' });
  }

  captureSlice(startSec: number, endSec: number): Promise<AudioBuffer | null> {
    if (!this.node || !this.trackId) return Promise.resolve(null);
    const id = ++this.captureId;
    return new Promise((resolve) => {
      this.captureWaiters.set(id, resolve);
      this.post({ type: 'capture', id, start: startSec * this.srcRate, end: endSec * this.srcRate });
      setTimeout(() => {
        if (this.captureWaiters.has(id)) {
          this.captureWaiters.delete(id);
          resolve(null);
        }
      }, 3000);
    });
  }
  dispose() {
    this.post({ type: 'dispose' });
    try {
      this.node?.disconnect();
      this.output.disconnect();
    } catch {
      /* noop */
    }
    this.subs.clear();
  }
}
