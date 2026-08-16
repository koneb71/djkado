import { Biquad } from './biquad';

export interface WaveformData {
  binsPerSecond: number;
  length: number; // number of bins
  low: Uint8Array;
  mid: Uint8Array;
  high: Uint8Array;
  peak: Uint8Array;
}

/**
 * Compute a 3-band (low/mid/high) + overall peak waveform at ~binsPerSecond resolution.
 * Values are 0..255 normalised to the track's max peak.
 */
export function computeWaveform(mono: Float32Array, sampleRate: number, binsPerSecond = 100): WaveformData {
  const samplesPerBin = Math.max(1, Math.round(sampleRate / binsPerSecond));
  const length = Math.ceil(mono.length / samplesPerBin);
  const low = new Float32Array(length);
  const mid = new Float32Array(length);
  const high = new Float32Array(length);
  const peak = new Float32Array(length);

  const lp = Biquad.create('lowpass', sampleRate, 200, 0.8);
  const bp1 = Biquad.create('highpass', sampleRate, 200, 0.8);
  const bp2 = Biquad.create('lowpass', sampleRate, 2000, 0.8);
  const hp = Biquad.create('highpass', sampleRate, 2000, 0.8);

  let bin = 0;
  let count = 0;
  let l = 0, m = 0, h = 0, p = 0;
  for (let i = 0; i < mono.length; i++) {
    const x = mono[i];
    const yl = Math.abs(lp.processSample(x));
    const ym = Math.abs(bp2.processSample(bp1.processSample(x)));
    const yh = Math.abs(hp.processSample(x));
    const ax = Math.abs(x);
    if (yl > l) l = yl;
    if (ym > m) m = ym;
    if (yh > h) h = yh;
    if (ax > p) p = ax;
    if (++count === samplesPerBin) {
      low[bin] = l; mid[bin] = m; high[bin] = h; peak[bin] = p;
      bin++; count = 0; l = m = h = p = 0;
    }
  }
  if (count > 0 && bin < length) {
    low[bin] = l; mid[bin] = m; high[bin] = h; peak[bin] = p;
  }
  const toU8 = (arr: Float32Array) => {
    let max = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    const out = new Uint8Array(arr.length);
    if (max > 0) for (let i = 0; i < arr.length; i++) out[i] = Math.min(255, Math.round((arr[i] / max) * 255));
    return out;
  };
  return { binsPerSecond: sampleRate / samplesPerBin, length, low: toU8(low), mid: toU8(mid), high: toU8(high), peak: toU8(peak) };
}
