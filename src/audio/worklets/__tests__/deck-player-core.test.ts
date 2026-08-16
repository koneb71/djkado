import { describe, it, expect } from 'vitest';
import { createPlayerState, renderBlock, readInterp } from '../deck-player-core';

function ramp(n: number) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return a;
}
function mkState(len = 1000, sr = 48000) {
  const s = createPlayerState();
  s.channels = [ramp(len)];
  s.length = len;
  s.srcRate = sr;
  s.playing = true;
  s.interp = 'linear';
  return s;
}
const out = (n: number) => [new Float32Array(n)];

describe('deck-player-core', () => {
  it('rate 1 reproduces source', () => {
    const s = mkState();
    const o = out(128);
    renderBlock(s, new Float32Array([1]), o, 128, 48000);
    for (let i = 0; i < 128; i++) expect(o[0][i]).toBeCloseTo(i, 4);
    expect(s.pos).toBeCloseTo(128, 6);
  });
  it('rate 0.5 and 2 advance accordingly', () => {
    const s = mkState();
    renderBlock(s, new Float32Array([0.5]), out(100), 100, 48000);
    expect(s.pos).toBeCloseTo(50, 6);
    renderBlock(s, new Float32Array([2]), out(100), 100, 48000);
    expect(s.pos).toBeCloseTo(250, 6);
  });
  it('negative rate plays backwards', () => {
    const s = mkState();
    s.pos = 500;
    const o = out(10);
    renderBlock(s, new Float32Array([-1]), o, 10, 48000);
    expect(o[0][0]).toBeCloseTo(500, 4);
    expect(o[0][9]).toBeCloseTo(491, 4);
    expect(s.pos).toBeCloseTo(490, 6);
  });
  it('sample-rate ratio scales the step', () => {
    const s = mkState(1000, 44100);
    renderBlock(s, new Float32Array([1]), out(100), 100, 48000);
    expect(s.pos).toBeCloseTo((100 * 44100) / 48000, 4);
  });
  it('loops forward and backward continuously', () => {
    const s = mkState();
    s.loop = { enabled: true, start: 100, end: 200 };
    s.pos = 190;
    const o = out(20);
    const ev = renderBlock(s, new Float32Array([1]), o, 20, 48000);
    expect(ev.loopWrapped).toBe(true);
    expect(s.pos).toBeCloseTo(110, 6);
    expect(o[0][10]).toBeCloseTo(100, 4);
    s.pos = 105;
    renderBlock(s, new Float32Array([-1]), out(10), 10, 48000);
    expect(s.pos).toBeCloseTo(195, 6);
  });
  it('slip shadow advances at nominal rate while scratching', () => {
    const s = mkState();
    s.slipEnabled = true;
    s.pos = 500;
    s.slipPos = 500;
    s.nominalRate = 1;
    renderBlock(s, new Float32Array([-2]), out(100), 100, 48000);
    expect(s.slipPos).toBeCloseTo(600, 6);
    expect(s.pos).toBeCloseTo(300, 6);
  });
  it('ends at the end of the buffer', () => {
    const s = mkState(100);
    s.pos = 90;
    const ev = renderBlock(s, new Float32Array([1]), out(20), 20, 48000);
    expect(ev.ended).toBe(true);
    expect(s.playing).toBe(false);
  });
  it('a-rate array is honoured per frame', () => {
    const s = mkState();
    const rates = new Float32Array(4);
    rates.set([1, 2, 3, 4]);
    renderBlock(s, rates, out(4), 4, 48000);
    expect(s.pos).toBeCloseTo(10, 6);
  });
  it('cubic interpolation error on a sine is small', () => {
    const sr = 48000;
    const n = 4096;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.sin((2 * Math.PI * 1000 * i) / sr);
    let err = 0;
    let count = 0;
    for (let p = 10; p < n - 10; p += 0.37) {
      const ref = Math.sin((2 * Math.PI * 1000 * p) / sr);
      const v = readInterp(buf, p, 'cubic', n);
      err += (v - ref) ** 2;
      count++;
    }
    const rmsErr = Math.sqrt(err / count);
    expect(20 * Math.log10(rmsErr)).toBeLessThan(-60);
  });
});
