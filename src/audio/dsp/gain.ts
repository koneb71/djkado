import { gainToDb } from './math';

/**
 * Simple loudness estimate: RMS over 400 ms blocks, gated, averaged in the energy domain.
 * Returns the gain (dB) required to bring the track to the target level.
 */
export function computeAutoGainDb(mono: Float32Array, sampleRate: number, targetDb = -16): number {
  const block = Math.round(sampleRate * 0.4);
  if (mono.length < block) return 0;
  const energies: number[] = [];
  for (let i = 0; i + block <= mono.length; i += block) {
    let s = 0;
    for (let k = 0; k < block; k++) {
      const v = mono[i + k];
      s += v * v;
    }
    energies.push(s / block);
  }
  // absolute gate at -60 dBFS
  const gate = Math.pow(10, -60 / 10);
  const gated = energies.filter((e) => e > gate);
  if (!gated.length) return 0;
  const avg = gated.reduce((a, b) => a + b, 0) / gated.length;
  // relative gate: drop blocks 10 dB under the mean
  const rel = avg * Math.pow(10, -10 / 10);
  const kept = gated.filter((e) => e > rel);
  const finalAvg = kept.reduce((a, b) => a + b, 0) / (kept.length || 1);
  const levelDb = gainToDb(Math.sqrt(finalAvg));
  const gain = targetDb - levelDb;
  return Math.max(-12, Math.min(12, Math.round(gain * 10) / 10));
}
