/**
 * STFT / iSTFT + padding helpers matching Demucs' torch.stft(normalized=True, center=True,
 * hann periodic window) as used by the htdemucs_embedded ONNX export (see timcsy/demucs-web).
 * Pure TS on top of the app's radix-2 FFT so it can run in a Worker and be unit-tested in Node.
 */
import { FFT } from '../dsp/fft';

const hannCache = new Map<number, Float32Array>();
/** Periodic Hann window (torch.hann_window default). */
export function hannPeriodic(size: number): Float32Array {
  let w = hannCache.get(size);
  if (!w) {
    w = new Float32Array(size);
    for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
    hannCache.set(size, w);
  }
  return w;
}

/** torch-style reflect padding (no edge repeat). */
export function reflectPad(signal: Float32Array, padLeft: number, padRight: number): Float32Array {
  const n = signal.length;
  const out = new Float32Array(padLeft + n + padRight);
  for (let i = 0; i < padLeft; i++) out[i] = signal[Math.min(padLeft - i, n - 1)];
  out.set(signal, padLeft);
  for (let i = 0; i < padRight; i++) out[padLeft + n + i] = signal[Math.max(0, n - 2 - i)];
  return out;
}

export interface Spectrogram {
  real: Float32Array; // [frame * numBins + bin]
  imag: Float32Array;
  numFrames: number;
  numBins: number;
}

const fftCache = new Map<number, FFT>();
const getFft = (n: number) => {
  let f = fftCache.get(n);
  if (!f) {
    f = new FFT(n);
    fftCache.set(n, f);
  }
  return f;
};

/** STFT of an already-padded signal: frames = floor((len - fftSize)/hop)+1, scale 1/sqrt(fftSize). */
export function stft(signal: Float32Array, fftSize: number, hop: number): Spectrogram {
  const numFrames = Math.floor((signal.length - fftSize) / hop) + 1;
  const numBins = fftSize / 2 + 1;
  const win = hannPeriodic(fftSize);
  const scale = 1 / Math.sqrt(fftSize);
  const real = new Float32Array(numFrames * numBins);
  const imag = new Float32Array(numFrames * numBins);
  const fft = getFft(fftSize);
  const frame = new Float32Array(fftSize);
  for (let f = 0; f < numFrames; f++) {
    frame.set(signal.subarray(f * hop, f * hop + fftSize));
    fft.forward(frame, win);
    const o = f * numBins;
    for (let k = 0; k < numBins; k++) {
      real[o + k] = fft.re[k] * scale;
      imag[o + k] = fft.im[k] * scale;
    }
  }
  return { real, imag, numFrames, numBins };
}

/** Inverse STFT with window-sum-square normalisation; inverse of stft() above. */
export function istft(spec: Spectrogram, fftSize: number, hop: number, length?: number): Float32Array {
  const { real, imag, numFrames, numBins } = spec;
  const outLen = length ?? (numFrames - 1) * hop + fftSize;
  const out = new Float32Array(outLen);
  const wsum = new Float32Array(outLen);
  const win = hannPeriodic(fftSize);
  const scale = Math.sqrt(fftSize);
  const fft = getFft(fftSize);
  const fullRe = new Float32Array(fftSize);
  const fullIm = new Float32Array(fftSize);
  for (let f = 0; f < numFrames; f++) {
    const o = f * numBins;
    for (let k = 0; k < numBins; k++) {
      fullRe[k] = real[o + k];
      fullIm[k] = imag[o + k];
    }
    for (let k = 1; k < numBins - 1; k++) {
      fullRe[fftSize - k] = fullRe[k];
      fullIm[fftSize - k] = -fullIm[k];
    }
    fft.inverse(fullRe, fullIm);
    const start = f * hop;
    for (let i = 0; i < fftSize && start + i < outLen; i++) {
      out[start + i] += fft.re[i] * win[i] * scale;
      wsum[start + i] += win[i] * win[i];
    }
  }
  for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-8) out[i] /= wsum[i];
  return out;
}
