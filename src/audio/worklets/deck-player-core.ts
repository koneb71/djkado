/**
 * Pure rendering core for the DeckPlayer AudioWorklet.
 * No Web Audio / DOM dependencies so it can be unit-tested in Node.
 *
 * Positions are in *source frames* (floating point). `rate` is a multiplier of
 * the source sample rate relative to the context sample rate:
 *   step per output frame = rate * srcRate / ctxRate
 */

export interface LoopState {
  enabled: boolean;
  start: number; // source frames
  end: number; // source frames (exclusive)
}

export interface StemSet {
  /** stems[i] = [L, R] Int16 PCM at srcRate, same length as the main buffer */
  channels: Int16Array[][];
  /** value = int16 / 32767 * scale[i] */
  scale: number[];
}

export interface PlayerState {
  channels: Float32Array[]; // PCM per channel
  srcRate: number;
  length: number; // frames
  pos: number; // playhead in source frames
  playing: boolean;
  loop: LoopState;
  slipEnabled: boolean;
  slipPos: number; // shadow playhead (advances at nominal rate while slipping)
  nominalRate: number; // rate that slip shadow follows (pitch fader rate)
  ended: boolean;
  interp: 'linear' | 'cubic';
  /** optional stems (vocals, drums, bass, other) mixed instead of the main PCM when stemsActive */
  stems: StemSet | null;
  stemsActive: boolean;
  stemGain: Float32Array; // current (smoothed) per-stem gains
  stemTarget: Float32Array; // target gains
}

export function createPlayerState(): PlayerState {
  return {
    channels: [],
    srcRate: 44100,
    length: 0,
    pos: 0,
    playing: false,
    loop: { enabled: false, start: 0, end: 0 },
    slipEnabled: false,
    slipPos: 0,
    nominalRate: 1,
    ended: false,
    interp: 'cubic',
    stems: null,
    stemsActive: false,
    stemGain: new Float32Array([1, 1, 1, 1]),
    stemTarget: new Float32Array([1, 1, 1, 1]),
  };
}

function hermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const c1 = 0.5 * (p2 - p0);
  const c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
  return ((c3 * t + c2) * t + c1) * t + p1;
}

/** Read a sample from `buf` at fractional index `pos` with the chosen interpolation. */
export function readInterp(buf: Float32Array, pos: number, interp: 'linear' | 'cubic', length: number): number {
  const i = Math.floor(pos);
  const t = pos - i;
  if (i < 0 || i >= length) return 0;
  if (interp === 'linear') {
    const a = buf[i];
    const b = i + 1 < length ? buf[i + 1] : 0;
    return a + (b - a) * t;
  }
  const p0 = i > 0 ? buf[i - 1] : buf[i];
  const p1 = buf[i];
  const p2 = i + 1 < length ? buf[i + 1] : 0;
  const p3 = i + 2 < length ? buf[i + 2] : 0;
  return hermite(p0, p1, p2, p3, t);
}

/** Read an Int16 stem sample with the same interpolation as readInterp (scaled by 1/32767·scale). */
export function readInterp16(buf: Int16Array, pos: number, interp: 'linear' | 'cubic', length: number, scale: number): number {
  const i = Math.floor(pos);
  const t = pos - i;
  if (i < 0 || i >= length) return 0;
  const k = scale / 32767;
  if (interp === 'linear') {
    const a = buf[i];
    const b = i + 1 < length ? buf[i + 1] : 0;
    return (a + (b - a) * t) * k;
  }
  const p0 = i > 0 ? buf[i - 1] : buf[i];
  const p1 = buf[i];
  const p2 = i + 1 < length ? buf[i + 1] : 0;
  const p3 = i + 2 < length ? buf[i + 2] : 0;
  return hermite(p0, p1, p2, p3, t) * k;
}

/** Per-sample gain smoothing coefficient (~5 ms at 48k) — click-free stem mutes. */
const STEM_SMOOTH = 0.004;

export interface RenderEvents {
  ended?: boolean;
  loopWrapped?: boolean;
}

/**
 * Render `frames` output frames into `out` (array of channel Float32Arrays).
 * `rates` is a per-frame rate array (a-rate AudioParam) or a single-element array (k-rate).
 * Mutates `state.pos` / `state.slipPos` / `state.ended`. Returns events.
 */
export function renderBlock(
  state: PlayerState,
  rates: Float32Array,
  out: Float32Array[],
  frames: number,
  ctxRate: number,
): RenderEvents {
  const events: RenderEvents = {};
  const nCh = out.length;
  const srcCh = state.channels.length;
  if (!state.playing || srcCh === 0 || state.length === 0) {
    for (let c = 0; c < nCh; c++) out[c].fill(0);
    return events;
  }
  const kRate = rates.length === 1;
  const ratio = state.srcRate / ctxRate;
  const loop = state.loop;
  const loopLen = loop.end - loop.start;
  const useLoop = loop.enabled && loopLen > 1;
  let pos = state.pos;
  const nominalStep = state.nominalRate * ratio;

  const stems = state.stemsActive && state.stems && state.stems.channels.length ? state.stems : null;
  const sg = state.stemGain;
  const st = state.stemTarget;

  for (let i = 0; i < frames; i++) {
    const rate = kRate ? rates[0] : rates[i];
    // Sample
    if (stems) {
      for (let k = 0; k < 4; k++) sg[k] += (st[k] - sg[k]) * STEM_SMOOTH;
      for (let c = 0; c < nCh; c++) {
        let v = 0;
        for (let k = 0; k < stems.channels.length; k++) {
          const g = sg[k];
          if (g <= 0.0005) continue;
          const chs = stems.channels[k];
          const buf = chs[c < chs.length ? c : chs.length - 1];
          v += g * readInterp16(buf, pos, state.interp, state.length, stems.scale[k]);
        }
        out[c][i] = v;
      }
    } else {
      for (let c = 0; c < nCh; c++) {
        const src = state.channels[c < srcCh ? c : srcCh - 1];
        out[c][i] = readInterp(src, pos, state.interp, state.length);
      }
    }
    pos += rate * ratio;
    // Loop wrap (both directions)
    if (useLoop) {
      if (rate > 0 && pos >= loop.end) {
        pos = loop.start + ((pos - loop.start) % loopLen);
        events.loopWrapped = true;
      } else if (rate < 0 && pos < loop.start) {
        pos = loop.end - ((loop.start - pos) % loopLen);
        events.loopWrapped = true;
      }
    }
    if (state.slipEnabled) state.slipPos += nominalStep;
    // Boundaries
    if (pos >= state.length) {
      pos = state.length;
      state.playing = false;
      state.ended = true;
      events.ended = true;
      for (let c = 0; c < nCh; c++) out[c].fill(0, i + 1);
      break;
    }
    if (pos < 0) {
      pos = 0;
      // reversing into the start: just hold
      for (let c = 0; c < nCh; c++) out[c].fill(0, i + 1);
      state.pos = 0;
      return events;
    }
  }
  state.pos = pos;
  return events;
}
