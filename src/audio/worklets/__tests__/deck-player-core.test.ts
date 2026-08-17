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

describe('stems mixing', () => {
  const mk16 = (n: number, val: number) => {
    const a = new Int16Array(n);
    a.fill(Math.round(val * 32767));
    return a;
  };
  it('mixes weighted stems and honours mutes with smoothing', () => {
    const s = mkState(20000);
    // constant stems: 0.1, 0.2, 0.3, 0.4 → sum 1.0
    s.stems = { channels: [0.1, 0.2, 0.3, 0.4].map((v) => [mk16(20000, v), mk16(20000, v)]), scale: [1, 1, 1, 1] };
    s.stemsActive = true;
    s.stemGain.set([1, 1, 1, 1]);
    s.stemTarget.set([1, 1, 1, 1]);
    const o = out(64);
    renderBlock(s, new Float32Array([1]), o, 64, 48000);
    expect(o[0][10]).toBeCloseTo(1.0, 3);
    // mute vocals (stem 0): target 0, gain smooths toward 0
    s.stemTarget[0] = 0;
    const o2 = out(4096);
    renderBlock(s, new Float32Array([1]), o2, 4096, 48000);
    expect(o2[0][0]).toBeGreaterThan(0.95); // still near 1 right after
    expect(o2[0][4095]).toBeCloseTo(0.9, 2); // converged to 0.9
    // no clicks: max sample-to-sample delta small
    let maxD = 0;
    for (let i = 1; i < 4096; i++) maxD = Math.max(maxD, Math.abs(o2[0][i] - o2[0][i - 1]));
    expect(maxD).toBeLessThan(0.002);
  });
  it('falls back to the mix when stems inactive', () => {
    const s = mkState(100);
    s.stems = { channels: [[mk16(100, 0.5), mk16(100, 0.5)]], scale: [1] };
    s.stemsActive = false;
    const o = out(4);
    renderBlock(s, new Float32Array([1]), o, 4, 48000);
    expect(o[0][1]).toBeCloseTo(1, 4); // ramp source value at index 1
  });
});
