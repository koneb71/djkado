/**
 * Stem-separation worker: owns the ONNX Runtime session (WebGPU → WASM fallback) and runs
 * the HTDemucs pipeline. Exposed via comlink. One instance per app (GPU work is serialized).
 */
import * as Comlink from 'comlink';
import * as ort from 'onnxruntime-web/webgpu';
// ORT 1.27's WebGPU EP runs on the *asyncify* wasm build (jsep is the legacy path).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { DEFAULT_STEM_MODEL, STEM_ORDER, type StemModel, type StemName } from './models';
import { ModelCache } from './ModelCache';
import { separateHtdemucs, type ModelIO, type ModelOut } from './htdemucs';
import { toInt16Scaled } from './resample';

export type StemEngine = 'webgpu' | 'wasm';

export interface StemsProgress {
  stage: 'downloading' | 'loading' | 'separating' | 'encoding';
  progress: number; // 0..1 within stage
  loadedBytes?: number;
  totalBytes?: number;
  done?: number;
  total?: number;
  engine?: StemEngine;
}

export interface StemsOutput {
  engine: StemEngine;
  sampleRate: number;
  length: number;
  /** STEM_ORDER: vocals, drums, bass, other → [L, R] Int16 */
  stems: Int16Array[][];
  scales: number[];
  elapsedMs: number;
}

let session: ort.InferenceSession | null = null;
let sessionModelId: string | null = null;
let engine: StemEngine = 'wasm';
let aborter: AbortController | null = null;

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
ort.env.wasm.numThreads = 1; // no cross-origin isolation → single thread
ort.env.logLevel = 'error';

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function ensureSession(m: StemModel, onProgress: (p: StemsProgress) => void, forceEp?: StemEngine, signal?: AbortSignal) {
  if (session && sessionModelId === m.id) return session;
  session?.release?.();
  session = null;
  const bytes = await ModelCache.get(m, (loaded, total) => onProgress({ stage: 'downloading', progress: total ? loaded / total : 0, loadedBytes: loaded, totalBytes: total }), signal);
  onProgress({ stage: 'loading', progress: 0 });
  const eps: StemEngine[] = forceEp ? [forceEp] : (await hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr: unknown = null;
  for (const ep of eps) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: 'basic' });
      engine = ep;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[stems] ${ep} session failed`, e);
    }
  }
  if (!session) throw lastErr instanceof Error ? lastErr : new Error('Could not create inference session');
  sessionModelId = m.id;
  onProgress({ stage: 'loading', progress: 1, engine });
  return session;
}

const api = {
  async probe(): Promise<{ webgpu: boolean }> {
    return { webgpu: await hasWebGpu() };
  },

  async modelCached(): Promise<boolean> {
    return ModelCache.has(DEFAULT_STEM_MODEL);
  },

  /** Download (and cache) the model without separating anything. */
  async prefetchModel(onProgress?: (p: StemsProgress) => void): Promise<void> {
    await ModelCache.get(DEFAULT_STEM_MODEL, (l, t) => onProgress?.({ stage: 'downloading', progress: t ? l / t : 0, loadedBytes: l, totalBytes: t }));
  },

  cancel() {
    aborter?.abort();
  },

  async separate(input: { left: Float32Array; right: Float32Array; sampleRate: number; forceEngine?: StemEngine }, onProgress?: (p: StemsProgress) => void): Promise<StemsOutput> {
    const m = DEFAULT_STEM_MODEL;
    if (input.sampleRate !== m.sampleRate) throw new Error(`Stems worker expects ${m.sampleRate} Hz input`);
    aborter = new AbortController();
    const signal = aborter.signal;
    const progress = (p: StemsProgress) => onProgress?.({ ...p, engine });
    const t0 = performance.now();
    const s = await ensureSession(m, progress, input.forceEngine, signal);
    const inName = s.inputNames[0];
    const specName = s.inputNames[1];
    const runModel = async (io: ModelIO): Promise<ModelOut> => {
      const feeds: Record<string, ort.Tensor> = { [inName]: new ort.Tensor('float32', io.waveform, [1, 2, m.segment]) };
      if (specName) feeds[specName] = new ort.Tensor('float32', io.spec, [1, 4, m.specBins, m.specFrames]);
      const res = await s.run(feeds);
      let time: Float32Array | null = null;
      let freq: Float32Array | null = null;
      for (const name of s.outputNames) {
        const t = res[name];
        if (t.dims.length === 4 && t.dims[2] === 2) time = t.data as Float32Array;
        else if (t.dims.length === 5 && t.dims[2] === 4) freq = t.data as Float32Array;
      }
      if (!time) throw new Error('Model returned no time-domain output');
      return { time, freq };
    };
    progress({ stage: 'separating', progress: 0, done: 0, total: 1 });
    const result = await separateHtdemucs(input.left, input.right, runModel, (done, total) => progress({ stage: 'separating', progress: done / total, done, total }), signal, m);
    progress({ stage: 'encoding', progress: 0 });
    const stems: Int16Array[][] = [];
    const scales: number[] = [];
    STEM_ORDER.forEach((name: StemName, i) => {
      const st = result.stems[name];
      // shared scale for L/R so stereo balance is preserved
      const l = toInt16Scaled(st.left);
      const r = toInt16Scaled(st.right);
      const scale = Math.max(l.scale, r.scale);
      const enc = (x: Float32Array) => {
        const inv = 32767 / scale;
        const d = new Int16Array(x.length);
        for (let k = 0; k < x.length; k++) d[k] = Math.round(x[k] * inv);
        return d;
      };
      stems.push(scale === l.scale && scale === r.scale ? [l.data, r.data] : [enc(st.left), enc(st.right)]);
      scales.push(scale);
      progress({ stage: 'encoding', progress: (i + 1) / STEM_ORDER.length });
    });
    const out: StemsOutput = { engine, sampleRate: m.sampleRate, length: input.left.length, stems, scales, elapsedMs: performance.now() - t0 };
    return Comlink.transfer(out, stems.flat().map((a) => a.buffer));
  },
};

export type StemsApi = typeof api;
Comlink.expose(api);
