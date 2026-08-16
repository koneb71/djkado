import { describe, it, expect } from 'vitest';
import { nearestBeat, nextBeat, prevBeat, beatPhase, phaseDelta, syncRate, quantize, nudgeGridTo } from '../beatgrid';

const g = { bpm: 120, firstBeatSec: 0.25 };

describe('beatgrid', () => {
  it('nearest/next/prev beat', () => {
    expect(nearestBeat(g, 0.9)).toBeCloseTo(0.75, 6);
    expect(nearestBeat(g, 1.1)).toBeCloseTo(1.25, 6);
    expect(nextBeat(g, 1.0)).toBeCloseTo(1.25, 6);
    expect(prevBeat(g, 1.0)).toBeCloseTo(0.75, 6);
    expect(nextBeat(g, 1.25)).toBeCloseTo(1.75, 6);
  });
  it('phase', () => {
    expect(beatPhase(g, 0.25)).toBeCloseTo(0, 6);
    expect(beatPhase(g, 0.5)).toBeCloseTo(0.5, 6);
  });
  it('sync rate', () => {
    expect(syncRate(128, 1, 120)).toBeCloseTo(128 / 120, 6);
    expect(syncRate(128, 1.05, 128)).toBeCloseTo(1.05, 6);
  });
  it('phase delta wraps to half beat', () => {
    const m = { bpm: 120, firstBeatSec: 0 };
    const s = { bpm: 120, firstBeatSec: 0 };
    expect(phaseDelta(m, 1.0, s, 0.9)).toBeCloseTo(0.1, 6);
    expect(phaseDelta(m, 1.0, s, 1.4)).toBeCloseTo(0.1, 6); // 0.4 behind == 0.1 ahead
  });
  it('quantize', () => {
    expect(quantize(g, 1.1, true)).toBeCloseTo(1.25, 6);
    expect(quantize(g, 1.1, false)).toBe(1.1);
    expect(quantize(null, 1.1, true)).toBe(1.1);
  });
  it('nudge keeps bpm and makes sec a beat', () => {
    const n = nudgeGridTo(g, 1.3);
    expect(n.bpm).toBe(120);
    expect(beatPhase(n, 1.3)).toBeCloseTo(0, 6);
  });
});
