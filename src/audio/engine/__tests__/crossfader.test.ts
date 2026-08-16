import { describe, it, expect } from 'vitest';
import { crossfaderGains, Crossfader } from '../Crossfader';

describe('crossfader', () => {
  it('power curve keeps constant power', () => {
    for (const x of [-1, -0.5, 0, 0.5, 1]) {
      const { left, right } = crossfaderGains(x, 'power');
      expect(left * left + right * right).toBeCloseTo(1, 6);
    }
  });
  it('linear sums to 1', () => {
    const { left, right } = crossfaderGains(0.2, 'linear');
    expect(left + right).toBeCloseTo(1, 6);
  });
  it('cut is full until the last few %', () => {
    expect(crossfaderGains(0.5, 'cut')).toEqual({ left: 1, right: 1 });
    expect(crossfaderGains(1, 'cut').left).toBe(0);
    expect(crossfaderGains(-1, 'cut').right).toBe(0);
  });
  it('assignment', () => {
    const xf = new Crossfader();
    xf.position = -1;
    expect(xf.gainFor('A')).toBeCloseTo(1);
    expect(xf.gainFor('B')).toBeCloseTo(0);
    xf.assign.B = 'thru';
    expect(xf.gainFor('B')).toBe(1);
  });
});
