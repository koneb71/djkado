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

  for (let i = 0; i < frames; i++) {
    const rate = kRate ? rates[0] : rates[i];
    // Sample
    for (let c = 0; c < nCh; c++) {
      const src = state.channels[c < srcCh ? c : srcCh - 1];
      out[c][i] = readInterp(src, pos, state.interp, state.length);
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
