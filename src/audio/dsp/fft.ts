/**
 * In-place iterative radix-2 complex FFT with precomputed twiddles.
 * Sized once per instance; reuse across frames.
 */
export class FFT {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  readonly re: Float32Array;
  readonly im: Float32Array;

  constructor(size: number) {
    if (size & (size - 1)) throw new Error('FFT size must be a power of two');
    this.size = size;
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.rev = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
  }

  /** Forward FFT of a real input frame; result in this.re / this.im. */
  forward(input: Float32Array, window?: Float32Array): void {
    const n = this.size;
    const re = this.re;
    const im = this.im;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      re[j] = window ? input[i] * window[i] : input[i];
      im[j] = 0;
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = this.sin[k * step];
          const a = i + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  /** Magnitude spectrum (size/2 bins) into out. */
  magnitude(out: Float32Array = new Float32Array(this.size / 2)): Float32Array {
    const half = this.size / 2;
    for (let i = 0; i < half; i++) out[i] = Math.hypot(this.re[i], this.im[i]);
    return out;
  }
}
