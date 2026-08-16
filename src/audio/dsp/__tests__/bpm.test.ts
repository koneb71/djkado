import { describe, it, expect } from 'vitest';
import { detectTempo, bpmFromTaps } from '../bpm';
import { clickTrack } from './synth';

describe('detectTempo', () => {
  for (const bpm of [85, 120, 128, 174]) {
    it(`detects ${bpm} BPM within ±0.3`, () => {
      const sr = 44100;
      const offset = 0.137;
      const x = clickTrack(bpm, 30, sr, offset, { hats: bpm !== 174 });
      const r = detectTempo(x, sr);
      // allow octave equivalence only for extreme tempos
      const candidates = [bpm, bpm * 2, bpm / 2];
      const closest = candidates.reduce((a, b) => (Math.abs(b - r.bpm) < Math.abs(a - r.bpm) ? b : a));
      if (bpm >= 70 && bpm <= 180) expect(closest).toBe(bpm);
      expect(Math.abs(r.bpm - closest)).toBeLessThan(0.3);
      // phase within ±15ms of a beat
      const beat = 60 / closest;
      const phaseErr = ((r.firstBeatSec - offset) % beat + beat) % beat;
      const err = Math.min(phaseErr, beat - phaseErr);
      expect(err).toBeLessThan(0.015);
      expect(r.confidence).toBeGreaterThan(0.2);
    });
  }

  it('does not double the tempo when 8th-note hats are present', () => {
    const x = clickTrack(124, 30, 44100, 0, { hats: true });
    const r = detectTempo(x, 44100);
    expect(Math.abs(r.bpm - 124)).toBeLessThan(0.5);
  });

  it('returns 0 for silence', () => {
    const r = detectTempo(new Float32Array(44100 * 10), 44100);
    expect(r.bpm).toBe(0);
  });
});

describe('bpmFromTaps', () => {
  it('computes tempo from tap intervals', () => {
    const taps = [0, 500, 1000, 1500, 2000];
    expect(bpmFromTaps(taps)).toBe(120);
  });
});
