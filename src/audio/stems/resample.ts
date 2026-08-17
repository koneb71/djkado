import { hermite } from '../dsp/math';

/**
 * Cubic (Catmull-Rom) resampler producing exactly `outLength` samples spanning the input.
 * Good enough for stems ↔ context-rate conversion (44.1k ↔ 48k); not for large ratios.
 */
export function resampleTo(input: Float32Array, outLength: number): Float32Array {
  const n = input.length;
  if (outLength === n) return input.slice();
  const out = new Float32Array(outLength);
  if (n === 0 || outLength === 0) return out;
  const ratio = n / outLength;
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const t = pos - j;
    const p0 = input[Math.max(0, j - 1)];
    const p1 = input[Math.min(n - 1, j)];
    const p2 = input[Math.min(n - 1, j + 1)];
    const p3 = input[Math.min(n - 1, j + 2)];
    out[i] = hermite(p0, p1, p2, p3, t);
  }
  return out;
}

/** Float32 → Int16 with a per-buffer scale so peaks above ±1 don't clip. Returns { data, scale } where value = data/32767*scale. */
export function toInt16Scaled(x: Float32Array): { data: Int16Array; scale: number } {
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > peak) peak = a;
  }
  const scale = peak > 1 ? peak : 1;
  const inv = 32767 / scale;
  const data = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) data[i] = Math.round(x[i] * inv);
  return { data, scale };
}
