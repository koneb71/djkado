import { describe, it, expect } from 'vitest';
import { detectKey, camelotCompatible, shiftCamelot } from '../key';
import { chord } from './synth';

describe('detectKey', () => {
  it('detects C major triad progression as 8B', () => {
    // C E G + F A C + G B D  (I IV V)
    const parts = [chord([60, 64, 67], 2), chord([65, 69, 72], 2), chord([67, 71, 74], 2), chord([60, 64, 67], 2)];
    const x = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { x.set(p, o); o += p.length; }
    const r = detectKey(x, 22050);
    expect(r.camelot).toBe('8B');
  });
  it('detects A minor as 8A', () => {
    const parts = [chord([57, 60, 64], 2), chord([62, 65, 69], 2), chord([64, 68, 71], 2), chord([57, 60, 64], 2)];
    const x = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { x.set(p, o); o += p.length; }
    const r = detectKey(x, 22050);
    expect(r.camelot).toBe('8A');
  });
});

describe('camelot helpers', () => {
  it('compatibility', () => {
    expect(camelotCompatible('8A', '8B')).toBe(true);
    expect(camelotCompatible('8A', '9A')).toBe(true);
    expect(camelotCompatible('12A', '1A')).toBe(true);
    expect(camelotCompatible('8A', '10A')).toBe(false);
  });
  it('shift by semitone moves +7 on the wheel', () => {
    expect(shiftCamelot('8A', 1)).toBe('3A');
    expect(shiftCamelot('8A', -1)).toBe('1A');
  });
});
