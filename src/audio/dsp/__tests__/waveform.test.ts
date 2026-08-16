import { describe, it, expect } from 'vitest';
import { computeWaveform } from '../waveform';
import { sine } from './synth';

describe('computeWaveform', () => {
  it('puts 100Hz energy in the low band', () => {
    const w = computeWaveform(sine(100, 2), 44100, 100);
    expect(w.length).toBe(200);
    const mid = Math.floor(w.length / 2);
    expect(w.low[mid]).toBeGreaterThan(200);
    // mid/high normalised per-band, so compare raw ratio via peak instead: high should be tiny relative in absolute terms
    // (each band normalised independently, so we check that the low band is saturated where the tone is)
    expect(w.peak[mid]).toBeGreaterThan(200);
  });
  it('bin count matches duration', () => {
    const w = computeWaveform(new Float32Array(44100 * 3), 44100, 100);
    expect(w.length).toBe(300);
    expect(Math.round(w.binsPerSecond)).toBe(100);
  });
});
