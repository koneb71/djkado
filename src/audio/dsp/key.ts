import { FFT } from './fft';
import { hannWindow } from './math';

export interface KeyResult {
  camelot: string; // e.g. "8A"
  name: string; // e.g. "A minor"
  confidence: number; // 0..1
  chroma: Float32Array; // 12 bins C..B
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Kessler profiles
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// EDMA profiles (Faraldo et al.) tuned for electronic music
const EDMA_MAJOR = [0.16519551, 0.04749026, 0.08293076, 0.06687112, 0.09994645, 0.09274123, 0.05294487, 0.13159476, 0.05218986, 0.07443653, 0.06940723, 0.0642515];
const EDMA_MINOR = [0.17235348, 0.05336489, 0.0761783, 0.10043649, 0.05621495, 0.08592235, 0.05589306, 0.13341845, 0.06805562, 0.06546095, 0.06714586, 0.06555561];

// Camelot wheel: major = B, minor = A. Index by pitch class.
const CAMELOT_MAJOR: Record<number, string> = { 0: '8B', 1: '3B', 2: '10B', 3: '5B', 4: '12B', 5: '7B', 6: '2B', 7: '9B', 8: '4B', 9: '11B', 10: '6B', 11: '1B' };
const CAMELOT_MINOR: Record<number, string> = { 0: '5A', 1: '12A', 2: '7A', 3: '2A', 4: '9A', 5: '4A', 6: '11A', 7: '6A', 8: '1A', 9: '8A', 10: '3A', 11: '10A' };

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Compute a 12-bin chroma vector via STFT with harmonic-weighted pitch class mapping. */
export function computeChroma(mono: Float32Array, sampleRate: number, frameSize = 4096, hop = 2048): Float32Array {
  const fft = new FFT(frameSize);
  const win = hannWindow(frameSize);
  const chroma = new Float32Array(12);
  const half = frameSize / 2;
  const minF = 55; // A1
  const maxF = 5000;
  const minBin = Math.max(1, Math.floor((minF / sampleRate) * frameSize));
  const maxBin = Math.min(half - 1, Math.ceil((maxF / sampleRate) * frameSize));
  // Precompute bin → pitch class + weight
  const pcOfBin = new Int8Array(half);
  const wOfBin = new Float32Array(half);
  for (let b = minBin; b <= maxBin; b++) {
    const f = (b * sampleRate) / frameSize;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const dist = Math.abs(midi - Math.round(midi)); // 0..0.5
    pcOfBin[b] = pc;
    // de-emphasise very high partials, and bins far from a note centre
    wOfBin[b] = (1 - dist * 1.6) * (1 / (1 + Math.max(0, (f - 1000) / 2000)));
  }
  const frame = new Float32Array(frameSize);
  const nFrames = Math.floor((mono.length - frameSize) / hop);
  for (let i = 0; i < nFrames; i++) {
    frame.set(mono.subarray(i * hop, i * hop + frameSize));
    fft.forward(frame, win);
    for (let b = minBin; b <= maxBin; b++) {
      const mag = Math.hypot(fft.re[b], fft.im[b]);
      if (mag <= 0) continue;
      chroma[pcOfBin[b]] += Math.log1p(mag) * Math.max(0, wOfBin[b]);
    }
  }
  let max = 0;
  for (let i = 0; i < 12; i++) if (chroma[i] > max) max = chroma[i];
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
  return chroma;
}

export function keyFromChroma(chroma: Float32Array): KeyResult {
  let best = { score: -Infinity, pc: 0, minor: false };
  let second = -Infinity;
  const rot = new Float32Array(12);
  for (let pc = 0; pc < 12; pc++) {
    for (let i = 0; i < 12; i++) rot[i] = chroma[(i + pc) % 12];
    const majScore = 0.5 * pearson(rot, KK_MAJOR) + 0.5 * pearson(rot, EDMA_MAJOR);
    const minScore = 0.5 * pearson(rot, KK_MINOR) + 0.5 * pearson(rot, EDMA_MINOR);
    for (const [score, minor] of [[majScore, false], [minScore, true]] as const) {
      if (score > best.score) {
        second = best.score;
        best = { score, pc, minor };
      } else if (score > second) second = score;
    }
  }
  const name = `${NOTE_NAMES[best.pc]} ${best.minor ? 'minor' : 'major'}`;
  const camelot = best.minor ? CAMELOT_MINOR[best.pc] : CAMELOT_MAJOR[best.pc];
  const confidence = Math.max(0, Math.min(1, (best.score - second) * 3 + best.score * 0.5));
  return { camelot, name, confidence, chroma };
}

export function detectKey(mono: Float32Array, sampleRate: number): KeyResult {
  return keyFromChroma(computeChroma(mono, sampleRate));
}

/** Camelot compatibility: same, ±1 number, or relative major/minor. */
export function camelotCompatible(a: string, b: string): boolean {
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  if (!pa || !pb) return false;
  if (pa.n === pb.n) return true; // same number, either letter
  if (pa.l !== pb.l) return false;
  const d = Math.abs(pa.n - pb.n);
  return d === 1 || d === 11;
}

export function parseCamelot(c: string): { n: number; l: 'A' | 'B' } | null {
  const m = /^(\d{1,2})([AB])$/.exec(c);
  if (!m) return null;
  return { n: Number(m[1]), l: m[2] as 'A' | 'B' };
}

/** Shift a Camelot key by n semitones (for key-shift display). */
export function shiftCamelot(c: string, semitones: number): string {
  const p = parseCamelot(c);
  if (!p) return c;
  // 1 semitone up = +7 on the wheel
  const n = (((p.n - 1 + semitones * 7) % 12) + 12) % 12;
  return `${n + 1}${p.l}`;
}
