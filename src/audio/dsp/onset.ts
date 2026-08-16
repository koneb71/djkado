import { FFT } from './fft';
import { hannWindow } from './math';

export interface OnsetOptions {
  frameSize?: number; // default 1024
  hopSize?: number; // default 128
  lowBandWeight?: number; // extra weight for bins below ~200 Hz (kick emphasis)
}

export interface OnsetResult {
  oss: Float32Array; // onset strength signal, one value per hop
  fps: number; // frames per second of oss
  hopSize: number;
}

/**
 * Spectral-flux onset strength signal (OSS).
 * Half-wave rectified difference of log-magnitude spectra between consecutive frames.
 */
export function onsetStrength(mono: Float32Array, sampleRate: number, opts: OnsetOptions = {}): OnsetResult {
  const frameSize = opts.frameSize ?? 1024;
  const hop = opts.hopSize ?? 128;
  const lowW = opts.lowBandWeight ?? 2;
  const fft = new FFT(frameSize);
  const win = hannWindow(frameSize);
  const half = frameSize / 2;
  const nFrames = Math.max(0, Math.floor((mono.length - frameSize) / hop) + 1);
  const oss = new Float32Array(nFrames);
  const prev = new Float32Array(half);
  const cur = new Float32Array(half);
  const frame = new Float32Array(frameSize);
  const lowBins = Math.max(1, Math.floor((200 / sampleRate) * frameSize));

  for (let f = 0; f < nFrames; f++) {
    frame.set(mono.subarray(f * hop, f * hop + frameSize));
    fft.forward(frame, win);
    let flux = 0;
    for (let b = 1; b < half; b++) {
      const mag = Math.log1p(10 * Math.hypot(fft.re[b], fft.im[b]));
      cur[b] = mag;
      const d = mag - prev[b];
      if (d > 0) flux += b < lowBins ? d * lowW : d;
    }
    oss[f] = flux;
    prev.set(cur);
  }
  // remove local mean (simple high-pass) to emphasise transients
  const meanWin = Math.round((sampleRate / hop) * 0.5); // 0.5 s
  const smoothed = new Float32Array(nFrames);
  let acc = 0;
  for (let i = 0; i < nFrames; i++) {
    acc += oss[i];
    if (i >= meanWin) acc -= oss[i - meanWin];
    const m = acc / Math.min(i + 1, meanWin);
    smoothed[i] = Math.max(0, oss[i] - m);
  }
  return { oss: smoothed, fps: sampleRate / hop, hopSize: hop };
}
