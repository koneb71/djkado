/** Constant-tempo beatgrid utilities (VirtualDJ/Serato style single-BPM grid). */
export interface BeatGrid {
  bpm: number;
  firstBeatSec: number; // position of beat #0 (a downbeat by default)
  beatsPerBar?: number; // default 4
}

export const beatLength = (g: BeatGrid) => 60 / g.bpm;

export function beatIndexAt(g: BeatGrid, sec: number): number {
  return (sec - g.firstBeatSec) / beatLength(g);
}

export function beatTime(g: BeatGrid, index: number): number {
  return g.firstBeatSec + index * beatLength(g);
}

/** Fractional phase within the current beat, [0,1). */
export function beatPhase(g: BeatGrid, sec: number): number {
  const b = beatIndexAt(g, sec);
  return b - Math.floor(b);
}

/** Position within the bar, 0..beatsPerBar (integer part is the beat-in-bar). */
export function barPosition(g: BeatGrid, sec: number): number {
  const bpb = g.beatsPerBar ?? 4;
  const b = beatIndexAt(g, sec);
  return ((b % bpb) + bpb) % bpb;
}

export function nearestBeat(g: BeatGrid, sec: number, subdivision = 1): number {
  const step = beatLength(g) / subdivision;
  const n = Math.round((sec - g.firstBeatSec) / step);
  return g.firstBeatSec + n * step;
}

export function nextBeat(g: BeatGrid, sec: number, subdivision = 1): number {
  const step = beatLength(g) / subdivision;
  const n = Math.floor((sec - g.firstBeatSec) / step + 1e-6) + 1;
  return g.firstBeatSec + n * step;
}

export function prevBeat(g: BeatGrid, sec: number, subdivision = 1): number {
  const step = beatLength(g) / subdivision;
  const n = Math.ceil((sec - g.firstBeatSec) / step - 1e-6) - 1;
  return g.firstBeatSec + n * step;
}

/** Quantize a time to the grid if enabled. */
export function quantize(g: BeatGrid | null, sec: number, enabled: boolean, subdivision = 1): number {
  if (!enabled || !g || !g.bpm) return sec;
  return Math.max(0, nearestBeat(g, sec, subdivision));
}

/** Compute the rate multiplier for slave to match master tempo. */
export function syncRate(masterBpm: number, masterRate: number, slaveBpm: number): number {
  if (!masterBpm || !slaveBpm) return 1;
  return (masterBpm * masterRate) / slaveBpm;
}

/**
 * Phase difference between master and slave in *seconds of slave time*, wrapped to ±half beat.
 * Positive means slave is behind (needs to speed up / jump forward).
 */
export function phaseDelta(master: BeatGrid, masterSec: number, slave: BeatGrid, slaveSec: number): number {
  const mp = beatPhase(master, masterSec);
  const sp = beatPhase(slave, slaveSec);
  let d = mp - sp;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d * beatLength(slave);
}

/** Shift the grid so that `sec` becomes a beat (keeps bpm). */
export function nudgeGridTo(g: BeatGrid, sec: number): BeatGrid {
  const bl = beatLength(g);
  const offset = ((sec - g.firstBeatSec) % bl + bl) % bl;
  return { ...g, firstBeatSec: g.firstBeatSec + offset };
}

export function halveGrid(g: BeatGrid): BeatGrid {
  return { ...g, bpm: g.bpm / 2 };
}
export function doubleGrid(g: BeatGrid): BeatGrid {
  return { ...g, bpm: g.bpm * 2 };
}
