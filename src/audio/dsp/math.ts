export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
export const wrap01 = (v: number) => v - Math.floor(v);

/** Cubic Hermite (Catmull-Rom) interpolation between p1 and p2 with neighbours p0 and p3. */
export function hermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const c0 = p1;
  const c1 = 0.5 * (p2 - p0);
  const c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

/** Parabolic interpolation of a peak at index i in array a; returns fractional offset in [-0.5, 0.5]. */
export function parabolicPeakOffset(a: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= a.length - 1) return 0;
  const y0 = a[i - 1];
  const y1 = a[i];
  const y2 = a[i + 1];
  const denom = y0 - 2 * y1 + y2;
  if (denom === 0) return 0;
  return clamp((0.5 * (y0 - y2)) / denom, -0.5, 0.5);
}

export function mean(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
}

export function rms(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return a.length ? Math.sqrt(s / a.length) : 0;
}

export function normalizeInPlace(a: Float32Array): Float32Array {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]);
    if (v > max) max = v;
  }
  if (max > 0) for (let i = 0; i < a.length; i++) a[i] /= max;
  return a;
}

export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/** Simple box-filter decimation for anti-aliased downsampling by an integer factor. */
export function decimate(input: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return input;
  const outLen = Math.floor(input.length / factor);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let s = 0;
    const base = i * factor;
    for (let k = 0; k < factor; k++) s += input[base + k];
    out[i] = s / factor;
  }
  return out;
}

export function formatTime(seconds: number, showMs = false): string {
  if (!isFinite(seconds)) return '--:--';
  const neg = seconds < 0;
  const s = Math.abs(seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  const base = `${neg ? '-' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return showMs ? `${base}.${ms.toString().padStart(3, '0')}` : base;
}
