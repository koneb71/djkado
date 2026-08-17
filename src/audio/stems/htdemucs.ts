/**
 * HTDemucs (Demucs v4) separation pipeline for the `htdemucs_embedded.onnx` export.
 * Faithful port of timcsy/demucs-web `processor.js` (MIT):
 *   - fixed 343 980-sample segments (7.8 s @ 44.1 kHz), 25 % overlap, linear cross-fade weights
 *   - inputs: waveform [1,2,N] + complex-as-channels spectrogram [1,4,2048,336]
 *   - outputs: spectrogram branch [1,4,4,2048,336] (iSTFT'd here) + time branch [1,4,2,N], summed
 * The ORT session is abstracted behind `runModel` so this module stays pure & testable.
 */
import { HTDEMUCS, type StemModel, type StemName } from './models';
import { istft, reflectPad, stft, type Spectrogram } from './stft';

export interface ModelIO {
  waveform: Float32Array; // [2, N]
  spec: Float32Array; // [4, bins, frames]
}
export interface ModelOut {
  time: Float32Array; // [4 tracks, 2 ch, N]
  freq: Float32Array | null; // [4 tracks, 4 (LRe,LIm,RRe,RIm), bins, frames]
}
export type RunModel = (io: ModelIO) => Promise<ModelOut>;

/** Model output track order for htdemucs: drums, bass, other, vocals. */
const MODEL_TRACKS: readonly StemName[] = ['drums', 'bass', 'other', 'vocals'];

export function prepareModelInput(left: Float32Array, right: Float32Array, m: StemModel = HTDEMUCS): ModelIO {
  const N = m.segment;
  const padL = new Float32Array(N);
  const padR = new Float32Array(N);
  padL.set(left.subarray(0, Math.min(left.length, N)));
  padR.set(right.subarray(0, Math.min(right.length, N)));

  const le = Math.ceil(N / m.hop);
  const pad = Math.floor(m.hop / 2) * 3;
  const padRight = pad + le * m.hop - N;
  const center = m.fftSize / 2;
  const sL = stft(reflectPad(reflectPad(padL, pad, padRight), center, center), m.fftSize, m.hop);
  const sR = stft(reflectPad(reflectPad(padR, pad, padRight), center, center), m.fftSize, m.hop);

  const B = m.specBins;
  const F = m.specFrames;
  const spec = new Float32Array(4 * B * F);
  const frameOffset = 2;
  for (let f = 0; f < F; f++) {
    const src = (f + frameOffset) * sL.numBins;
    for (let b = 0; b < B; b++) {
      const o = b * F + f;
      spec[0 * B * F + o] = sL.real[src + b];
      spec[1 * B * F + o] = sL.imag[src + b];
      spec[2 * B * F + o] = sR.real[src + b];
      spec[3 * B * F + o] = sR.imag[src + b];
    }
  }
  const waveform = new Float32Array(2 * N);
  waveform.set(padL, 0);
  waveform.set(padR, N);
  return { waveform, spec };
}

/** iSTFT one track's complex spectrogram back to `targetLength` samples (with Demucs' frame/sample offsets). */
function ispecTrack(freq: Float32Array, track: number, m: StemModel, targetLength: number): { left: Float32Array; right: Float32Array } {
  const B = m.specBins;
  const F = m.specFrames;
  const paddedBins = B + 1;
  const paddedFrames = F + 4;
  const mk = (chRe: number, chIm: number): Spectrogram => {
    const real = new Float32Array(paddedFrames * paddedBins);
    const imag = new Float32Array(paddedFrames * paddedBins);
    const base = track * 4 * B * F;
    for (let f = 0; f < F; f++) {
      const dst = (f + 2) * paddedBins;
      for (let b = 0; b < B; b++) {
        real[dst + b] = freq[base + chRe * B * F + b * F + f];
        imag[dst + b] = freq[base + chIm * B * F + b * F + f];
      }
    }
    return { real, imag, numFrames: paddedFrames, numBins: paddedBins };
  };
  const len = (paddedFrames - 1) * m.hop + m.fftSize;
  const l = istft(mk(0, 1), m.fftSize, m.hop, len);
  const r = istft(mk(2, 3), m.fftSize, m.hop, len);
  const off = m.fftSize / 2 + Math.floor(m.hop / 2) * 3;
  return { left: l.slice(off, off + targetLength), right: r.slice(off, off + targetLength) };
}

/** Linear fade-in/out weights for overlap-add of segments (as in demucs-web / demucs apply_model). */
export function segmentWindow(segmentLength: number, stride: number): Float32Array {
  const w = new Float32Array(segmentLength);
  for (let i = 0; i < segmentLength; i++) {
    const fadeIn = Math.min(i / (stride * 0.5), 1);
    const fadeOut = Math.min((segmentLength - i) / (stride * 0.5), 1);
    w[i] = Math.min(fadeIn, fadeOut);
  }
  return w;
}

export interface SeparateResult {
  stems: Record<StemName, { left: Float32Array; right: Float32Array }>;
}

/**
 * Separate a stereo 44.1 kHz signal into 4 stems. `runModel` executes one segment.
 * `onProgress(done, total)` after each segment. `signal` aborts between segments.
 */
export async function separateHtdemucs(
  left: Float32Array,
  right: Float32Array,
  runModel: RunModel,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  m: StemModel = HTDEMUCS,
): Promise<SeparateResult> {
  const total = left.length;
  const N = m.segment;
  const stride = Math.floor(N * (1 - m.overlap));
  const numSegments = Math.max(1, Math.ceil((total - N) / stride) + 1);
  const outs = MODEL_TRACKS.map(() => ({ left: new Float32Array(total), right: new Float32Array(total) }));
  const weights = new Float32Array(total);
  let done = 0;
  for (let start = 0; start < total; start += stride) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const end = Math.min(start + N, total);
    const segLen = end - start;
    const io = prepareModelInput(left.subarray(start, end), right.subarray(start, end), m);
    const out = await runModel(io);
    const win = segmentWindow(segLen, stride);
    for (let t = 0; t < 4; t++) {
      let fl: Float32Array | null = null;
      let fr: Float32Array | null = null;
      if (out.freq) {
        const f = ispecTrack(out.freq, t, m, N);
        fl = f.left;
        fr = f.right;
      }
      const tl = t * 2 * N;
      const tr = tl + N;
      const oL = outs[t].left;
      const oR = outs[t].right;
      for (let i = 0; i < segLen; i++) {
        const w = win[i];
        oL[start + i] += (out.time[tl + i] + (fl ? fl[i] : 0)) * w;
        oR[start + i] += (out.time[tr + i] + (fr ? fr[i] : 0)) * w;
      }
    }
    for (let i = 0; i < segLen; i++) weights[start + i] += win[i];
    done++;
    onProgress?.(done, numSegments);
    if (end >= total) break;
  }
  for (const o of outs) {
    for (let i = 0; i < total; i++) {
      const w = weights[i];
      if (w > 0) {
        o.left[i] /= w;
        o.right[i] /= w;
      }
    }
  }
  const stems = {} as SeparateResult['stems'];
  MODEL_TRACKS.forEach((name, t) => (stems[name] = outs[t]));
  return { stems };
}
