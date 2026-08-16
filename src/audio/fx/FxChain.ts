import { FxUnit, type FxKind } from './FxUnit';
import { createFx } from './units';

export const FX_SLOTS = 3;

/**
 * Serial chain of up to FX_SLOTS insert effects.
 * input → slot0 → slot1 → slot2 → output ; empty slots are pass-through.
 */
export class FxChain {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly slots: (FxUnit | null)[] = new Array(FX_SLOTS).fill(null);
  private bpm = 120;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.rewire();
  }

  setSlot(i: number, kind: FxKind | null) {
    const prev = this.slots[i];
    if (prev) prev.dispose();
    this.slots[i] = kind ? createFx(this.ctx, kind) : null;
    this.slots[i]?.setTempo(this.bpm);
    this.rewire();
    return this.slots[i];
  }

  setTempo(bpm: number) {
    this.bpm = bpm;
    for (const s of this.slots) s?.setTempo(bpm);
  }

  private rewire() {
    try {
      this.input.disconnect();
    } catch {
      /* noop */
    }
    let node: AudioNode = this.input;
    for (const s of this.slots) {
      if (!s) continue;
      try {
        s.output.disconnect();
      } catch {
        /* noop */
      }
      node.connect(s.input);
      node = s.output;
    }
    node.connect(this.output);
  }
}
