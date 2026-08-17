import { describe, it, expect } from 'vitest';
import { stft, istft, reflectPad, hannPeriodic } from '../stft';
import { segmentWindow, prepareModelInput } from '../htdemucs';
import { HTDEMUCS } from '../models';
import { resampleTo, toInt16Scaled } from '../resample';

describe('stft/istft', () => {
  it('round-trips a signal (< -60 dB error away from the edges)', () => {
    const n = 4096 * 8;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.05) * 0.5 + Math.sin(i * 0.31) * 0.3;
    const padded = reflectPad(x, 2048, 2048);
    const spec = stft(padded, 4096, 1024);
    const y = istft(spec, 4096, 1024, padded.length);
    let err = 0, sig = 0;
    for (let i = 4096; i < n - 4096; i++) {
      const d = y[i + 2048] - x[i];
      err += d * d;
      sig += x[i] * x[i];
    }
    expect(10 * Math.log10(err / sig)).toBeLessThan(-60);
  });
  it('periodic hann window', () => {
    const w = hannPeriodic(8);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[4]).toBeCloseTo(1, 6);
  });
  it('reflect pad mirrors without repeating the edge', () => {
    const p = reflectPad(new Float32Array([1, 2, 3, 4]), 2, 2);
    expect(Array.from(p)).toEqual([3, 2, 1, 2, 3, 4, 3, 2]);
  });
});

describe('htdemucs helpers', () => {
  it('model input shapes', () => {
    const seg = HTDEMUCS.segment;
    const io = prepareModelInput(new Float32Array(seg), new Float32Array(seg));
    expect(io.waveform.length).toBe(2 * seg);
    expect(io.spec.length).toBe(4 * HTDEMUCS.specBins * HTDEMUCS.specFrames);
  });
  it('overlap windows never drop out in the steady state', () => {
    const N = 1000, stride = 750;
    const total = 5000;
    const acc = new Float32Array(total);
    for (let start = 0; start + 1 <= total; start += stride) {
      const len = Math.min(N, total - start);
      const w = segmentWindow(len, stride);
      for (let i = 0; i < len; i++) acc[start + i] += w[i];
      if (start + N >= total) break;
    }
    for (let i = 500; i < total - 500; i++) expect(acc[i]).toBeGreaterThan(0.5); // pipeline divides by these weights
  });
});

describe('resample', () => {
  it('produces exact length and preserves a slow sine', () => {
    const inN = 44100, outN = 48000;
    const x = new Float32Array(inN);
    for (let i = 0; i < inN; i++) x[i] = Math.sin((2 * Math.PI * 100 * i) / inN);
    const y = resampleTo(x, outN);
    expect(y.length).toBe(outN);
    let err = 0;
    for (let i = 10; i < outN - 10; i++) err = Math.max(err, Math.abs(y[i] - Math.sin((2 * Math.PI * 100 * i) / outN)));
    expect(err).toBeLessThan(1e-3);
  });
  it('int16 scaling handles peaks above 1', () => {
    const { data, scale } = toInt16Scaled(new Float32Array([0, 1.5, -1.5]));
    expect(scale).toBeCloseTo(1.5);
    expect(data[1]).toBe(32767);
    expect(data[2]).toBe(-32767);
  });
});
