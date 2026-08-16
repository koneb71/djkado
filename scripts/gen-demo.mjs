import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/demo', { recursive: true });
function gen(bpm, seconds, seed, out) {
  const sr = 22050, n = seconds * sr, x = new Float32Array(n);
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff) * 2 - 1;
  const beat = (60 / bpm) * sr;
  const kickLen = Math.floor(0.14 * sr), hatLen = Math.floor(0.03 * sr), snLen = Math.floor(0.12 * sr);
  const bassNotes = [55, 55, 65.4, 49];
  for (let i = 0; i < n; i++) {
    const t = i / sr; const bar = Math.floor(t / ((60 / bpm) * 4)) % 4;
    // bass: saw-ish w/ lowpass feel via sine + third harmonic
    const f = bassNotes[bar];
    x[i] += 0.18 * Math.sin(2 * Math.PI * f * t) + 0.06 * Math.sin(2 * Math.PI * f * 3 * t);
    // pad chord
    x[i] += 0.05 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t));
  }
  for (let b = 0, k = 0; b < n; b += beat, k++) {
    const st = Math.round(b);
    for (let j = 0; j < kickLen && st + j < n; j++) { const e = Math.exp(-j / (0.035 * sr)); x[st + j] += 0.9 * Math.sin(2 * Math.PI * (48 + 100 * e) * j / sr) * e; }
    if (k % 2 === 1) for (let j = 0; j < snLen && st + j < n; j++) { const e = Math.exp(-j / (0.03 * sr)); x[st + j] += (rnd() * 0.5 + 0.3 * Math.sin(2 * Math.PI * 180 * j / sr)) * e * 0.5; }
    const off = Math.round(b + beat / 2);
    for (let j = 0; j < hatLen && off + j < n; j++) { const e = Math.exp(-j / (0.008 * sr)); x[off + j] += rnd() * e * 0.22; }
  }
  // soft clip + fade
  for (let i = 0; i < n; i++) { const fade = Math.min(1, i / (0.05 * sr), (n - i) / (0.5 * sr)); x[i] = Math.tanh(x[i] * 1.2) * 0.9 * fade; }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  writeFileSync(out, buf);
  console.log('wrote', out, (buf.length / 1024 / 1024).toFixed(2), 'MB');
}
gen(124, 30, 7, 'public/demo/demo-house-124.wav');
gen(130, 30, 99, 'public/demo/demo-techno-130.wav');
