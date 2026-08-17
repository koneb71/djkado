import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectTempo } from '../bpm';
import { detectKey } from '../key';
import { decimate } from '../math';
import { resampleTo } from '../../stems/resample';

/** Decode the 16-bit mono demo WAVs shipped in public/demo (22.05 kHz). */
function loadWav(path: string): { data: Float32Array; sampleRate: number } {
  const buf = readFileSync(path);
  const sampleRate = buf.readUInt32LE(24);
  const n = (buf.length - 44) / 2;
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return { data, sampleRate };
}

describe('tempo on the shipped demo clips at several sample rates', () => {
  const cases: [string, number][] = [
    ['public/demo/demo-house-124.wav', 124],
    ['public/demo/demo-techno-130.wav', 130],
  ];
  for (const [file, bpm] of cases) {
    for (const sr of [22050, 44100, 48000]) {
      it(`${file.split('/').pop()} @ ${sr} Hz → ${bpm}`, () => {
        const w = loadWav(file);
        const x = sr === w.sampleRate ? w.data : resampleTo(w.data, Math.round((w.data.length * sr) / w.sampleRate));
        const r = detectTempo(x, sr);
        expect(Math.abs(r.bpm - bpm)).toBeLessThan(0.5);
        // key path as used by the analysis worker (decimate to ~22.05k first)
        const kf = Math.max(1, Math.round(sr / 22050));
        const k = detectKey(decimate(x, kf), sr / kf);
        expect(k.camelot).toBe('8A');
      });
    }
  }
});
