import { FxUnit, type FxKind, type FxParamSpec } from './FxUnit';
import bitcrusherUrl from '../worklets/bitcrusher.worklet.ts?worker&url';

const BEAT_STEPS = [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 3 / 4, 1, 2];

/* ---------------------------------- Echo ---------------------------------- */
export class Echo extends FxUnit {
  readonly kind = 'echo' as const;
  readonly params: FxParamSpec[] = [
    { name: 'time', label: 'Time', min: 0, max: BEAT_STEPS.length - 1, default: 4, steps: BEAT_STEPS },
    { name: 'feedback', label: 'Fdbk', min: 0, max: 0.95, default: 0.45 },
    { name: 'tone', label: 'Tone', min: 300, max: 12000, default: 4000, curve: 'log', unit: 'Hz' },
  ];
  private delay!: DelayNode;
  private fb!: GainNode;
  private lp!: BiquadFilterNode;

  protected build() {
    this.delay = this.ctx.createDelay(4);
    this.fb = this.ctx.createGain();
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.wetIn.connect(this.delay);
    this.delay.connect(this.lp);
    this.lp.connect(this.fb);
    this.fb.connect(this.delay);
    this.lp.connect(this.wet);
  }
  protected apply(name: string, v: number) {
    const t = this.ctx.currentTime;
    if (name === 'time') this.onTempo();
    else if (name === 'feedback') this.fb.gain.setTargetAtTime(v, t, 0.02);
    else if (name === 'tone') this.lp.frequency.setTargetAtTime(v, t, 0.02);
  }
  protected onTempo() {
    const step = BEAT_STEPS[Math.round(this.getParam('time'))] ?? 0.5;
    const sec = Math.min(4, (60 / this.bpm) * step);
    this.delay.delayTime.setTargetAtTime(sec, this.ctx.currentTime, 0.05);
  }
}

/* --------------------------------- Reverb --------------------------------- */
let irCache: Map<string, AudioBuffer> = new Map();
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const key = `${ctx.sampleRate}-${seconds}-${decay}`;
  const cached = irCache.get(key);
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const n = (Math.random() * 2 - 1) * env;
      // one-pole HF damping increasing over time
      lp += (n - lp) * (0.9 - 0.6 * (i / len));
      d[i] = lp;
    }
  }
  irCache.set(key, buf);
  if (irCache.size > 6) irCache = new Map([...irCache].slice(-6));
  return buf;
}

export class Reverb extends FxUnit {
  readonly kind = 'reverb' as const;
  readonly params: FxParamSpec[] = [
    { name: 'size', label: 'Size', min: 0.3, max: 6, default: 2.2, unit: 's' },
    { name: 'damp', label: 'Damp', min: 500, max: 16000, default: 6000, curve: 'log', unit: 'Hz' },
    { name: 'predelay', label: 'Pre', min: 0, max: 0.12, default: 0.02, unit: 's' },
  ];
  private conv!: ConvolverNode;
  private pre!: DelayNode;
  private lp!: BiquadFilterNode;
  protected build() {
    this.pre = this.ctx.createDelay(0.5);
    this.conv = this.ctx.createConvolver();
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.wetIn.connect(this.pre);
    this.pre.connect(this.conv);
    this.conv.connect(this.lp);
    this.lp.connect(this.wet);
  }
  protected apply(name: string, v: number) {
    const t = this.ctx.currentTime;
    if (name === 'size') this.conv.buffer = makeImpulse(this.ctx, v, 2.5);
    else if (name === 'damp') this.lp.frequency.setTargetAtTime(v, t, 0.02);
    else if (name === 'predelay') this.pre.delayTime.setTargetAtTime(v, t, 0.02);
  }
}

/* --------------------------------- Flanger -------------------------------- */
export class Flanger extends FxUnit {
  readonly kind = 'flanger' as const;
  readonly params: FxParamSpec[] = [
    { name: 'rate', label: 'Rate', min: 0.05, max: 5, default: 0.4, curve: 'log', unit: 'Hz' },
    { name: 'depth', label: 'Depth', min: 0.0005, max: 0.006, default: 0.003, unit: 's' },
    { name: 'feedback', label: 'Fdbk', min: 0, max: 0.9, default: 0.5 },
  ];
  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private fb!: GainNode;
  protected build() {
    this.delay = this.ctx.createDelay(0.05);
    this.delay.delayTime.value = 0.004;
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfoGain = this.ctx.createGain();
    this.fb = this.ctx.createGain();
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.wetIn.connect(this.delay);
    this.delay.connect(this.fb);
    this.fb.connect(this.delay);
    this.delay.connect(this.wet);
    this.lfo.start();
  }
  protected apply(name: string, v: number) {
    const t = this.ctx.currentTime;
    if (name === 'rate') this.lfo.frequency.setTargetAtTime(v, t, 0.02);
    else if (name === 'depth') this.lfoGain.gain.setTargetAtTime(v, t, 0.02);
    else if (name === 'feedback') this.fb.gain.setTargetAtTime(v, t, 0.02);
  }
}

/* --------------------------------- Phaser --------------------------------- */
export class Phaser extends FxUnit {
  readonly kind = 'phaser' as const;
  readonly params: FxParamSpec[] = [
    { name: 'rate', label: 'Rate', min: 0.05, max: 8, default: 0.5, curve: 'log', unit: 'Hz' },
    { name: 'depth', label: 'Depth', min: 100, max: 3000, default: 1200, unit: 'Hz' },
    { name: 'feedback', label: 'Fdbk', min: 0, max: 0.9, default: 0.4 },
  ];
  private stages: BiquadFilterNode[] = [];
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private fb!: GainNode;
  protected build() {
    let node: AudioNode = this.wetIn;
    for (let i = 0; i < 6; i++) {
      const ap = this.ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 800 + i * 200;
      ap.Q.value = 0.6;
      node.connect(ap);
      node = ap;
      this.stages.push(ap);
    }
    this.fb = this.ctx.createGain();
    node.connect(this.fb);
    this.fb.connect(this.stages[0]);
    node.connect(this.wet);
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'triangle';
    this.lfoGain = this.ctx.createGain();
    this.lfo.connect(this.lfoGain);
    for (const s of this.stages) this.lfoGain.connect(s.frequency);
    this.lfo.start();
  }
  protected apply(name: string, v: number) {
    const t = this.ctx.currentTime;
    if (name === 'rate') this.lfo.frequency.setTargetAtTime(v, t, 0.02);
    else if (name === 'depth') this.lfoGain.gain.setTargetAtTime(v, t, 0.02);
    else if (name === 'feedback') this.fb.gain.setTargetAtTime(v, t, 0.02);
  }
}

/* -------------------------------- Bitcrusher ------------------------------ */
let bitcrusherLoaded: Promise<void> | null = null;
export function loadBitcrusherWorklet(ctx: AudioContext) {
  if (!bitcrusherLoaded) bitcrusherLoaded = ctx.audioWorklet.addModule(bitcrusherUrl);
  return bitcrusherLoaded;
}

export class Bitcrusher extends FxUnit {
  readonly kind = 'bitcrusher' as const;
  readonly params: FxParamSpec[] = [
    { name: 'bits', label: 'Bits', min: 2, max: 16, default: 8 },
    { name: 'reduction', label: 'Rate', min: 1, max: 40, default: 6 },
  ];
  private node: AudioWorkletNode | null = null;
  protected build() {
    loadBitcrusherWorklet(this.ctx)
      .then(() => {
        this.node = new AudioWorkletNode(this.ctx, 'bitcrusher', { outputChannelCount: [2] });
        this.wetIn.connect(this.node);
        this.node.connect(this.wet);
        for (const [k, v] of this.values) this.apply(k, v);
      })
      .catch(() => {
        // fallback: pass-through wet
        this.wetIn.connect(this.wet);
      });
  }
  protected apply(name: string, v: number) {
    if (!this.node) return;
    const p = this.node.parameters.get(name);
    p?.setValueAtTime(v, this.ctx.currentTime);
  }
}

/* -------------------------------- Filter LFO ------------------------------ */
export class FilterLfo extends FxUnit {
  readonly kind = 'filter' as const;
  readonly params: FxParamSpec[] = [
    { name: 'rate', label: 'Rate', min: 0, max: BEAT_STEPS.length - 1, default: 6, steps: BEAT_STEPS },
    { name: 'depth', label: 'Depth', min: 0, max: 1, default: 0.8 },
    { name: 'res', label: 'Res', min: 0.5, max: 12, default: 4 },
  ];
  private filter!: BiquadFilterNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  protected build() {
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1200;
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfoGain = this.ctx.createGain();
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.detune);
    this.wetIn.connect(this.filter);
    this.filter.connect(this.wet);
    this.lfo.start();
  }
  protected apply(name: string, v: number) {
    const t = this.ctx.currentTime;
    if (name === 'rate') this.onTempo();
    else if (name === 'depth') this.lfoGain.gain.setTargetAtTime(v * 4800, t, 0.02);
    else if (name === 'res') this.filter.Q.setTargetAtTime(v, t, 0.02);
  }
  protected onTempo() {
    const step = BEAT_STEPS[Math.round(this.getParam('rate'))] ?? 1;
    const hz = 1 / ((60 / this.bpm) * step * 2);
    this.lfo.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.05);
  }
}

/* ---------------------------------- Gate ---------------------------------- */
export class Gate extends FxUnit {
  readonly kind = 'gate' as const;
  readonly params: FxParamSpec[] = [
    { name: 'rate', label: 'Rate', min: 0, max: BEAT_STEPS.length - 1, default: 2, steps: BEAT_STEPS },
    { name: 'duty', label: 'Duty', min: 0.1, max: 0.9, default: 0.5 },
  ];
  private gate!: GainNode;
  private lfo!: OscillatorNode;
  private shaper!: WaveShaperNode;
  protected build() {
    this.gate = this.ctx.createGain();
    this.gate.gain.value = 0;
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.shaper = this.ctx.createWaveShaper();
    this.lfo.connect(this.shaper);
    this.shaper.connect(this.gate.gain);
    this.wetIn.connect(this.gate);
    this.gate.connect(this.wet);
    this.lfo.start();
  }
  protected apply(name: string, v: number) {
    if (name === 'rate') this.onTempo();
    else if (name === 'duty') {
      // saw in [-1,1] → 1 while below threshold, 0 above => duty cycle
      const curve = new Float32Array(256);
      const thr = v * 2 - 1;
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = x < thr ? 1 : 0;
      }
      this.shaper.curve = curve;
    }
  }
  protected onTempo() {
    const step = BEAT_STEPS[Math.round(this.getParam('rate'))] ?? 0.25;
    const hz = 1 / ((60 / this.bpm) * step);
    this.lfo.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
  }
}

export function createFx(ctx: AudioContext, kind: FxKind): FxUnit {
  switch (kind) {
    case 'echo':
      return new Echo(ctx).init();
    case 'reverb':
      return new Reverb(ctx).init();
    case 'flanger':
      return new Flanger(ctx).init();
    case 'phaser':
      return new Phaser(ctx).init();
    case 'bitcrusher':
      return new Bitcrusher(ctx).init();
    case 'filter':
      return new FilterLfo(ctx).init();
    case 'gate':
      return new Gate(ctx).init();
  }
}
