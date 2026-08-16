import { onsetStrength } from './onset';
import { decimate, parabolicPeakOffset } from './math';

export interface TempoResult {
  bpm: number;
  confidence: number; // 0..1
  firstBeatSec: number;
  candidates: { bpm: number; score: number }[];
}

export interface TempoOptions {
  minBpm?: number;
  maxBpm?: number;
  priorBpm?: number; // centre of log-gaussian prior
  priorSigmaOctaves?: number;
}

/**
 * Estimate tempo + first beat position from a mono signal.
 * Steps: decimate → onset strength → autocorrelation × prior → octave check → parabolic refine → phase.
 */
export function detectTempo(mono: Float32Array, sampleRate: number, opts: TempoOptions = {}): TempoResult {
  const minBpm = opts.minBpm ?? 60;
  const maxBpm = opts.maxBpm ?? 200;
  const priorBpm = opts.priorBpm ?? 125;
  const sigma = opts.priorSigmaOctaves ?? 0.9;

  // Work at ~11 kHz for speed
  const factor = Math.max(1, Math.round(sampleRate / 11025));
  const x = decimate(mono, factor);
  const sr = sampleRate / factor;
  const { oss, fps } = onsetStrength(x, sr, { frameSize: 1024, hopSize: 128 });
  if (oss.length < fps * 4) {
    return { bpm: 0, confidence: 0, firstBeatSec: 0, candidates: [] };
  }

  // Autocorrelation over lag range
  const minLag = Math.floor((60 / maxBpm) * fps);
  const maxLag = Math.ceil((60 / minBpm) * fps);
  const n = oss.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += oss[i];
  m /= n;
  const centered = new Float32Array(n);
  for (let i = 0; i < n; i++) centered[i] = oss[i] - m;

  const ac = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += centered[i] * centered[i + lag];
    ac[lag] = s / (n - lag);
  }
  // normalise
  let acMax = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > acMax) acMax = ac[lag];
  if (acMax <= 0) return { bpm: 0, confidence: 0, firstBeatSec: 0, candidates: [] };

  // Enhance with harmonics (comb): score(lag) = ac(lag) + 0.5*ac(2lag) + 0.25*ac(4lag)
  const scored = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = ac[lag] / acMax;
    if (lag * 2 <= maxLag) s += 0.5 * (ac[lag * 2] / acMax);
    else if (lag * 2 < n) s += 0.5 * (autocorrAt(centered, lag * 2) / acMax);
    if (lag * 4 < n) s += 0.25 * (autocorrAt(centered, lag * 4) / acMax);
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / priorBpm) / sigma, 2));
    scored[lag] = s * (0.35 + 0.65 * prior);
  }

  // pick local maxima
  const peaks: { lag: number; score: number }[] = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (scored[lag] > scored[lag - 1] && scored[lag] >= scored[lag + 1]) peaks.push({ lag, score: scored[lag] });
  }
  peaks.sort((a, b) => b.score - a.score);
  const top = peaks.slice(0, 5);
  if (!top.length) return { bpm: 0, confidence: 0, firstBeatSec: 0, candidates: [] };

  const best = top[0];
  const refinedLag = best.lag + parabolicPeakOffset(scored, best.lag);
  let bpm = (60 * fps) / refinedLag;

  // Octave sanity: prefer 70..180 range unless evidence strongly favours otherwise
  if (bpm < 70 && bpm * 2 <= maxBpm) bpm *= 2;
  else if (bpm > 180 && bpm / 2 >= minBpm) bpm /= 2;

  const second = top[1]?.score ?? 0;
  const confidence = Math.max(0, Math.min(1, (best.score - second) / (best.score || 1) + 0.35));

  // Fine refinement on the OSS (coarse, ±3%), then a joint BPM+phase refinement on a
  // 1 ms time-domain energy-rise envelope so the grid lands on the actual transients.
  bpm = refineTempo(oss, fps, bpm, 0.03, 0.1);
  const coarse = estimatePhase(oss, fps, bpm);
  const { rise, envRate } = energyRise(x, sr);
  const fine = refineOnEnvelope(rise, envRate, bpm, coarse);
  bpm = fine.bpm;
  const firstBeatSec = fine.firstBeatSec;

  return {
    bpm: Math.round(bpm * 100) / 100,
    confidence,
    firstBeatSec: Math.max(0, firstBeatSec),
    candidates: top.map((p) => ({ bpm: Math.round(((60 * fps) / p.lag) * 100) / 100, score: p.score })),
  };
}

/** Score a tempo by the best-phase pulse-train correlation with the OSS. */
function pulseScore(oss: Float32Array, fps: number, bpm: number, maxFrames: number): number {
  const period = (60 / bpm) * fps;
  const steps = Math.max(8, Math.round(period / 2));
  let best = 0;
  for (let s = 0; s < steps; s++) {
    let sum = 0;
    let count = 0;
    for (let t = (s / steps) * period; t < maxFrames; t += period) {
      const i = Math.round(t);
      sum += Math.max(oss[i] ?? 0, oss[i - 1] ?? 0, oss[i + 1] ?? 0);
      count++;
    }
    if (count && sum / count > best) best = sum / count;
  }
  return best;
}

function refineTempo(oss: Float32Array, fps: number, bpm: number, rangeFrac: number, stepBpm: number): number {
  const maxFrames = Math.min(oss.length, Math.floor(fps * 60));
  const lo = bpm * (1 - rangeFrac);
  const hi = bpm * (1 + rangeFrac);
  let best = bpm;
  let bestScore = -Infinity;
  for (let b = lo; b <= hi + 1e-9; b += stepBpm) {
    const sc = pulseScore(oss, fps, b, maxFrames);
    if (sc > bestScore) {
      bestScore = sc;
      best = b;
    }
  }
  return best;
}

function autocorrAt(x: Float32Array, lag: number): number {
  let s = 0;
  const n = x.length;
  for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
  return s / (n - lag);
}

/**
 * Find beat phase: correlate a pulse train with the OSS over one period, pick best offset.
 * Analyses the first ~30 s where mixes are usually clean.
 */
function estimatePhase(oss: Float32Array, fps: number, bpm: number): number {
  const period = (60 / bpm) * fps; // in frames
  const analyseFrames = Math.min(oss.length, Math.floor(fps * 40));
  const steps = Math.max(16, Math.round(period));
  let bestOffset = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < steps; s++) {
    const offset = (s / steps) * period;
    let score = 0;
    let count = 0;
    for (let t = offset; t < analyseFrames; t += period) {
      const i = Math.round(t);
      // small window around the beat position (±1 frame) to tolerate jitter
      const v = Math.max(oss[i] ?? 0, oss[i - 1] ?? 0, oss[i + 1] ?? 0);
      score += v;
      count++;
    }
    if (count && score / count > bestScore) {
      bestScore = score / count;
      bestOffset = offset;
    }
  }
  return bestOffset / fps;
}

/** 1 ms RMS envelope → half-wave-rectified 4 ms rise (transient detector). */
function energyRise(x: Float32Array, sr: number): { rise: Float32Array; envRate: number } {
  const block = Math.max(1, Math.round(sr / 1000));
  const envRate = sr / block; // actual envelope sample rate (≈1 kHz)
  const nEnv = Math.floor(x.length / block);
  const env = new Float32Array(nEnv);
  for (let i = 0; i < nEnv; i++) {
    let s = 0;
    const base = i * block;
    for (let k = 0; k < block; k++) s += x[base + k] * x[base + k];
    env[i] = Math.sqrt(s / block);
  }
  // peak-hold (≈25 ms decay) removes low-frequency envelope ripple so a transient yields one rise lobe
  const decay = Math.exp(-1 / 25);
  let hold = 0;
  for (let i = 0; i < nEnv; i++) {
    hold = Math.max(env[i], hold * decay);
    env[i] = hold;
  }
  const rise = new Float32Array(nEnv);
  for (let i = 4; i < nEnv; i++) rise[i] = Math.max(0, env[i] - env[i - 4]);
  return { rise, envRate };
}

/**
 * Jointly refine BPM (±0.6 %, 0.01 steps) and phase on the 1 ms rise envelope.
 * Returns firstBeatSec normalised into [0, period).
 */
function refineOnEnvelope(rise: Float32Array, envRate: number, bpm0: number, coarseSec: number): { bpm: number; firstBeatSec: number } {
  const analyseN = Math.min(rise.length, Math.floor(60 * envRate));
  const coarseN = coarseSec * envRate;
  const score = (periodN: number, offN: number) => {
    let sum = 0;
    let n = 0;
    for (let t = coarseN + offN; t < analyseN; t += periodN) {
      const i = Math.round(t);
      if (i < 1) continue;
      sum += Math.max(rise[i], rise[i + 1] ?? 0, rise[i - 1]);
      n++;
    }
    return n ? sum / n : 0;
  };
  let best = { bpm: bpm0, off: 0, s: -Infinity };
  // pass 1: bpm step 0.05, phase step 2 ms over a full period (coarse phase may be biased
  // by STFT latency and by the coarse BPM error, so we don't trust it beyond a starting point)
  for (let b = bpm0 * 0.994; b <= bpm0 * 1.006; b += 0.05) {
    const p = (60 / b) * envRate;
    for (let off = -40; off < p - 40; off += 2) {
      const sc = score(p, off);
      if (sc > best.s) best = { bpm: b, off, s: sc };
    }
  }
  // pass 2: bpm step 0.01 around best, phase step 1 ms ±3
  const b1 = best.bpm;
  const o1 = best.off;
  for (let b = b1 - 0.06; b <= b1 + 0.06; b += 0.01) {
    const p = (60 / b) * envRate;
    for (let off = o1 - 3; off <= o1 + 3; off += 1) {
      const sc = score(p, off);
      if (sc > best.s) best = { bpm: b, off, s: sc };
    }
  }
  const period = 60 / best.bpm;
  // rise window is 4 ms: transient starts ~2 ms before the max-rise sample
  let sec = (coarseN + best.off - 2) / envRate;
  while (sec < 0) sec += period;
  while (sec - period >= 0) sec -= period;
  return { bpm: best.bpm, firstBeatSec: sec };
}

/** Tap-tempo helper: returns bpm from an array of timestamps (ms). */
export function bpmFromTaps(taps: number[]): number | null {
  if (taps.length < 2) return null;
  const recent = taps.slice(-8);
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (avg <= 0) return null;
  return Math.round((60000 / avg) * 100) / 100;
}
