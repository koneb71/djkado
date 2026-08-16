/** Synthetic audio generators for tests. */
export function clickTrack(bpm: number, seconds: number, sampleRate = 44100, offsetSec = 0, opts: { noise?: number; hats?: boolean } = {}): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  const beat = (60 / bpm) * sampleRate;
  const noise = opts.noise ?? 0.02;
  // pink-ish noise floor
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * noise * 0.2;
  }
  // kicks on every beat: decaying sine burst 60Hz + click
  const kickLen = Math.floor(0.12 * sampleRate);
  for (let t = offsetSec * sampleRate; t < n; t += beat) {
    const start = Math.round(t);
    for (let k = 0; k < kickLen && start + k < n; k++) {
      const env = Math.exp(-k / (0.03 * sampleRate));
      out[start + k] += Math.sin((2 * Math.PI * (55 + 80 * env) * k) / sampleRate) * env * 0.9 + (Math.random() * 2 - 1) * env * env * 0.3;
    }
  }
  if (opts.hats) {
    const hatLen = Math.floor(0.03 * sampleRate);
    for (let t = offsetSec * sampleRate + beat / 2; t < n; t += beat / 2) {
      const start = Math.round(t);
      for (let k = 0; k < hatLen && start + k < n; k++) {
        const env = Math.exp(-k / (0.008 * sampleRate));
        out[start + k] += (Math.random() * 2 - 1) * env * 0.25;
      }
    }
  }
  return out;
}

export function sine(freq: number, seconds: number, sampleRate = 44100, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

/** Sum of harmonics for a set of MIDI notes (a chord / arpeggio). */
export function chord(midiNotes: number[], seconds: number, sampleRate = 22050): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  for (const m of midiNotes) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    for (let h = 1; h <= 4; h++) {
      const a = 0.4 / h;
      for (let i = 0; i < n; i++) out[i] += a * Math.sin((2 * Math.PI * f * h * i) / sampleRate);
    }
  }
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] /= max || 1;
  return out;
}
