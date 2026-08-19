import * as Comlink from 'comlink';
import type { StemsApi, StemsOutput, StemsProgress } from './stems.worker';
import { DEFAULT_STEM_MODEL, STEM_ORDER } from './models';
import { useStems, type StemJob } from '@/store/stems';
import { getStoredStems, hasStoredStems, putStoredStems, type StoredStems } from '@/services/localLibrary/db';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { arrayBufferOf } from '@/services/tracks/bytes';

export interface StemsData {
  sampleRate: number;
  length: number;
  stems: Int16Array[][]; // STEM_ORDER × [L,R]
  scales: number[];
  engine: string;
}

interface Job {
  track: TrackRef;
  priority: 'high' | 'low';
  resolve: (d: StemsData) => void;
  reject: (e: unknown) => void;
}

const PART_BYTES = 12 * 1024 * 1024;

function toBlobs(a: Int16Array): Blob[] {
  const out: Blob[] = [];
  const bytes = a.byteLength;
  for (let o = 0; o < bytes; o += PART_BYTES) out.push(new Blob([new Uint8Array(a.buffer as ArrayBuffer, a.byteOffset + o, Math.min(PART_BYTES, bytes - o))]));
  return out;
}
async function fromBlobs(parts: Blob[]): Promise<Int16Array> {
  const bufs = await Promise.all(parts.map((b) => b.arrayBuffer()));
  const total = bufs.reduce((a, b) => a + b.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bufs) {
    out.set(new Uint8Array(b), o);
    o += b.byteLength;
  }
  return new Int16Array(out.buffer);
}

/** Decode a track's source at 44.1 kHz stereo (OfflineAudioContext resamples for us). */
async function decodeAt44k(track: TrackRef, signal?: AbortSignal): Promise<{ left: Float32Array; right: Float32Array }> {
  const ab = await arrayBufferOf(track, signal);
  const octx = new OfflineAudioContext(2, 1, DEFAULT_STEM_MODEL.sampleRate);
  const audio = await octx.decodeAudioData(ab);
  const left = new Float32Array(audio.length);
  const right = new Float32Array(audio.length);
  left.set(audio.getChannelData(0));
  right.set(audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0));
  return { left, right };
}

/**
 * Serialized stem-separation queue (one GPU job at a time) with IndexedDB caching and
 * progress mirrored into the `useStems` store.
 */
class StemsQueueImpl {
  private worker: Worker | null = null;
  private api: Comlink.Remote<StemsApi> | null = null;
  private queue: Job[] = [];
  private running: Job | null = null;
  private inflight = new Map<string, Promise<StemsData>>();
  private forceEngine: 'webgpu' | 'wasm' | undefined = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('ep')) as any;

  private ensure() {
    if (this.api) return this.api;
    this.worker = new Worker(new URL('./stems.worker.ts', import.meta.url), { type: 'module' });
    this.api = Comlink.wrap<StemsApi>(this.worker);
    return this.api;
  }

  async probe() {
    try {
      const api = this.ensure();
      const [p, cached] = await Promise.all([api.probe(), api.modelCached()]);
      useStems.getState().setCaps({ webgpu: p.webgpu, modelCached: cached });
      return p;
    } catch {
      useStems.getState().setCaps({ webgpu: false });
      return { webgpu: false };
    }
  }

  async prefetchModel() {
    const api = this.ensure();
    const set = useStems.getState().setJob;
    const key = '__model__';
    set(key, { state: 'downloading', progress: 0 });
    try {
      await api.prefetchModel(Comlink.proxy((p: StemsProgress) => set(key, { state: 'downloading', progress: p.progress, loadedBytes: p.loadedBytes, totalBytes: p.totalBytes })));
      set(key, { state: 'ready', progress: 1 });
      useStems.getState().setCaps({ modelCached: true });
    } catch (e: any) {
      set(key, { state: 'error', error: e?.message ?? String(e) });
      throw e;
    }
  }

  isCached(trackId: string) {
    return hasStoredStems(trackId);
  }

  /** Cached stems only (no computation). */
  async getCached(trackId: string): Promise<StemsData | null> {
    const rec = await getStoredStems(trackId);
    if (!rec || rec.modelId !== DEFAULT_STEM_MODEL.id) return null;
    const stems = await Promise.all(rec.parts.map((chs) => Promise.all(chs.map((parts) => fromBlobs(parts)))));
    useStems.getState().markReady(trackId, true);
    return { sampleRate: rec.sampleRate, length: rec.length, stems, scales: rec.scales, engine: rec.engine };
  }

  /** Get stems, computing (and caching) them if needed. */
  getOrPrepare(track: TrackRef, priority: 'high' | 'low' = 'high'): Promise<StemsData> {
    const id = track.meta.id;
    const existing = this.inflight.get(id);
    if (existing) return existing;
    const p = new Promise<StemsData>((resolve, reject) => {
      const job: Job = { track, priority, resolve, reject };
      if (priority === 'high') {
        const idx = this.queue.findIndex((j) => j.priority === 'low');
        if (idx === -1) this.queue.push(job);
        else this.queue.splice(idx, 0, job);
      } else this.queue.push(job);
      useStems.getState().setJob(id, { state: 'queued', progress: 0, error: undefined });
      void this.pump();
    });
    this.inflight.set(id, p);
    p.finally(() => this.inflight.delete(id)).catch(() => {});
    return p;
  }

  cancel(trackId: string) {
    const i = this.queue.findIndex((j) => j.track.meta.id === trackId);
    if (i >= 0) {
      const [job] = this.queue.splice(i, 1);
      job.reject(new DOMException('Aborted', 'AbortError'));
      useStems.getState().clearJob(trackId);
    } else if (this.running?.track.meta.id === trackId) {
      void this.api?.cancel();
    }
  }

  private async pump() {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running = job;
    const id = job.track.meta.id;
    const set = (patch: Partial<StemJob>) => useStems.getState().setJob(id, patch);
    try {
      const cached = await this.getCached(id);
      if (cached) {
        set({ state: 'ready', progress: 1 });
        job.resolve(cached);
        return;
      }
      set({ state: 'downloading', progress: 0, startedAt: Date.now() });
      const api = this.ensure();
      const { left, right } = await decodeAt44k(job.track);
      let sepStart = 0;
      const out: StemsOutput = await api.separate(
        Comlink.transfer({ left, right, sampleRate: DEFAULT_STEM_MODEL.sampleRate, forceEngine: this.forceEngine }, [left.buffer, right.buffer]),
        Comlink.proxy((p: StemsProgress) => {
          const state = p.stage === 'downloading' ? 'downloading' : p.stage === 'loading' ? 'loading' : p.stage === 'encoding' ? 'encoding' : 'separating';
          let etaSec: number | undefined;
          if (p.stage === 'separating') {
            if (!sepStart) sepStart = performance.now();
            if (p.done && p.total) etaSec = Math.max(0, (((performance.now() - sepStart) / 1000) / p.done) * (p.total - p.done));
          }
          set({ state, progress: p.progress, engine: p.engine, loadedBytes: p.loadedBytes, totalBytes: p.totalBytes, etaSec });
          if (p.stage === 'loading' && p.progress === 1) useStems.getState().setCaps({ modelCached: true });
        }),
      );
      const data: StemsData = { sampleRate: out.sampleRate, length: out.length, stems: out.stems, scales: out.scales, engine: out.engine };
      // persist
      try {
        const rec: StoredStems = {
          id,
          modelId: DEFAULT_STEM_MODEL.id,
          engine: out.engine,
          sampleRate: out.sampleRate,
          length: out.length,
          scales: out.scales,
          parts: out.stems.map((chs) => chs.map(toBlobs)),
          bytes: out.stems.flat().reduce((a, b) => a + b.byteLength, 0),
          createdAt: Date.now(),
          usedAt: Date.now(),
        };
        await putStoredStems(rec);
      } catch (e) {
        console.warn('stems cache write failed', e);
      }
      useStems.getState().markReady(id, true);
      set({ state: 'ready', progress: 1, engine: out.engine, etaSec: 0 });
      job.resolve(data);
    } catch (e: any) {
      if (e?.name === 'AbortError') useStems.getState().clearJob(id);
      else set({ state: 'error', error: e?.message ?? String(e) });
      job.reject(e);
    } finally {
      this.running = null;
      void this.pump();
    }
  }
}

export const StemsQueue = new StemsQueueImpl();
export { STEM_ORDER };
