/**
 * Non-React, high-frequency data channel. Engine writes here at audio/animation rates;
 * canvas / MotionValue consumers subscribe inside the shared rAF loop. Never put this in Zustand.
 */
export interface Channel<T> {
  get(): T;
  set(v: T): void;
  subscribe(cb: (v: T) => void): () => void;
}

export function createChannel<T>(initial: T): Channel<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v) {
      value = v;
      subs.forEach((s) => s(v));
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

export interface DeckRuntime {
  /** last reported playhead (seconds) */
  pos: number;
  /** AudioContext time of that report */
  ctxTime: number;
  /** effective playback rate at that report (0 when paused) */
  rate: number;
  playing: boolean;
  slipPos: number;
}

export interface MeterLevels {
  l: number; // 0..1 rms
  r: number;
  peakL: number;
  peakR: number;
}

export const deckRuntime: Record<string, Channel<DeckRuntime>> = {
  A: createChannel<DeckRuntime>({ pos: 0, ctxTime: 0, rate: 0, playing: false, slipPos: 0 }),
  B: createChannel<DeckRuntime>({ pos: 0, ctxTime: 0, rate: 0, playing: false, slipPos: 0 }),
  C: createChannel<DeckRuntime>({ pos: 0, ctxTime: 0, rate: 0, playing: false, slipPos: 0 }),
  D: createChannel<DeckRuntime>({ pos: 0, ctxTime: 0, rate: 0, playing: false, slipPos: 0 }),
};

export const deckMeters: Record<string, Channel<MeterLevels>> = {
  A: createChannel<MeterLevels>({ l: 0, r: 0, peakL: 0, peakR: 0 }),
  B: createChannel<MeterLevels>({ l: 0, r: 0, peakL: 0, peakR: 0 }),
  C: createChannel<MeterLevels>({ l: 0, r: 0, peakL: 0, peakR: 0 }),
  D: createChannel<MeterLevels>({ l: 0, r: 0, peakL: 0, peakR: 0 }),
};

export const masterMeter = createChannel<MeterLevels>({ l: 0, r: 0, peakL: 0, peakR: 0 });

/** Jog wheel angular velocity in revolutions/sec (for platter animation while scratching). */
export const jogVelocity: Record<string, Channel<number>> = {
  A: createChannel(0),
  B: createChannel(0),
  C: createChannel(0),
  D: createChannel(0),
};

/** Interpolated deck position (seconds) given the last runtime report and current context time. */
export function interpolatePos(rt: DeckRuntime, ctxNow: number): number {
  if (!rt.playing || rt.rate === 0) return rt.pos;
  return rt.pos + (ctxNow - rt.ctxTime) * rt.rate;
}
