export type FxParamSpec = {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: string;
  /** map 0..1 knob to value; default linear */
  curve?: 'lin' | 'log';
  /** discrete beat-fraction steps for time params */
  steps?: number[];
};

export type FxKind = 'echo' | 'reverb' | 'flanger' | 'phaser' | 'bitcrusher' | 'filter' | 'gate';

export const FX_KINDS: { kind: FxKind; label: string }[] = [
  { kind: 'echo', label: 'Echo' },
  { kind: 'reverb', label: 'Reverb' },
  { kind: 'flanger', label: 'Flanger' },
  { kind: 'phaser', label: 'Phaser' },
  { kind: 'bitcrusher', label: 'Crush' },
  { kind: 'filter', label: 'Filter LFO' },
  { kind: 'gate', label: 'Gate' },
];

/**
 * Base class for insert effects. Provides dry/wet mix and bypass with click-free ramps.
 *   input ─┬─ dry ─────────────┐
 *          └─ wetIn → [fx] → wet ┴→ output
 */
export abstract class FxUnit {
  abstract readonly kind: FxKind;
  abstract readonly params: FxParamSpec[];
  readonly input: GainNode;
  readonly output: GainNode;
  protected readonly dry: GainNode;
  protected readonly wetIn: GainNode;
  protected readonly wet: GainNode;
  protected values = new Map<string, number>();
  private _enabled = false;
  private _mix = 0.5;
  protected bpm = 120;

  constructor(protected ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wetIn = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry);
    this.input.connect(this.wetIn);
    this.dry.connect(this.output);
    this.wet.connect(this.output);
    this.wetIn.gain.value = 0;
    this.wet.gain.value = 0;
    this.dry.gain.value = 1;
  }

  /** Subclasses connect wetIn → ... → wet. Called once after construction by `init()`. */
  protected abstract build(): void;

  init(): this {
    this.build();
    for (const p of this.params) this.values.set(p.name, p.default);
    for (const p of this.params) this.apply(p.name, p.default);
    return this;
  }

  get enabled() {
    return this._enabled;
  }
  get mix() {
    return this._mix;
  }

  setEnabled(on: boolean) {
    this._enabled = on;
    this.updateMix();
  }

  setMix(m: number) {
    this._mix = Math.max(0, Math.min(1, m));
    this.updateMix();
  }

  private updateMix() {
    const t = this.ctx.currentTime;
    const wet = this._enabled ? this._mix : 0;
    // equal-power-ish crossfade
    const dryG = Math.cos(wet * Math.PI * 0.5);
    const wetG = Math.sin(wet * Math.PI * 0.5);
    this.dry.gain.setTargetAtTime(dryG, t, 0.015);
    this.wet.gain.setTargetAtTime(wetG, t, 0.015);
    this.wetIn.gain.setTargetAtTime(this._enabled ? 1 : 0, t, 0.015);
  }

  setParam(name: string, value: number) {
    const spec = this.params.find((p) => p.name === name);
    if (!spec) return;
    const v = Math.max(spec.min, Math.min(spec.max, value));
    this.values.set(name, v);
    this.apply(name, v);
  }

  getParam(name: string): number {
    return this.values.get(name) ?? 0;
  }

  setTempo(bpm: number) {
    if (bpm > 0) this.bpm = bpm;
    this.onTempo();
  }

  protected onTempo() {}
  protected abstract apply(name: string, value: number): void;

  dispose() {
    try {
      this.input.disconnect();
      this.output.disconnect();
    } catch {
      /* noop */
    }
  }
}
