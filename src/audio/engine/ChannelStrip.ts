import { FxChain } from '../fx/FxChain';
import { dbToGain } from '../dsp/math';
import { rmsPeak } from './MasterBus';
import { deckMeters } from '@/store/runtime';
import type { DeckId } from './types';

/**
 * Per-deck mixer channel:
 * input → trim → eqLow → eqMid → eqHigh → filter → fx → fader → xfGain → out (+ analyser tap, cue tap)
 */
export class ChannelStrip {
  readonly input: GainNode;
  readonly trim: GainNode;
  readonly eqLow: BiquadFilterNode;
  readonly eqMid: BiquadFilterNode;
  readonly eqHigh: BiquadFilterNode;
  readonly killLow: GainNode; // dedicated kill for full -inf (shelf can't do -inf)
  readonly filterLP: BiquadFilterNode;
  readonly filterHP: BiquadFilterNode;
  readonly fx: FxChain;
  readonly fader: GainNode;
  readonly xfGain: GainNode;
  readonly cueTap: GainNode; // pre-fader (post fx) tap for headphone cue
  readonly output: GainNode;
  private analyser: AnalyserNode;
  private analyserBuf: Float32Array;
  private peak = 0;

  private _faderValue = 1;
  private _xfValue = 1;
  private _filter = 0.5; // 0 = full LP, 0.5 = bypass, 1 = full HP

  constructor(readonly ctx: AudioContext, readonly id: DeckId) {
    this.input = ctx.createGain();
    this.trim = ctx.createGain();
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.7;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 4000;
    this.killLow = ctx.createGain();
    this.filterLP = ctx.createBiquadFilter();
    this.filterLP.type = 'lowpass';
    this.filterLP.frequency.value = 22050;
    this.filterLP.Q.value = 0.7;
    this.filterHP = ctx.createBiquadFilter();
    this.filterHP.type = 'highpass';
    this.filterHP.frequency.value = 10;
    this.filterHP.Q.value = 0.7;
    this.fx = new FxChain(ctx);
    this.fader = ctx.createGain();
    this.xfGain = ctx.createGain();
    this.cueTap = ctx.createGain();
    this.cueTap.gain.value = 0;
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);

    this.input.connect(this.trim);
    this.trim.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.filterHP);
    this.filterHP.connect(this.filterLP);
    this.filterLP.connect(this.fx.input);
    this.fx.output.connect(this.fader);
    this.fx.output.connect(this.cueTap);
    this.fader.connect(this.xfGain);
    this.xfGain.connect(this.output);
    this.xfGain.connect(this.analyser);
  }

  private t() {
    return this.ctx.currentTime;
  }

  /** dB trim (auto-gain + user gain) */
  setTrimDb(db: number) {
    this.trim.gain.setTargetAtTime(dbToGain(db), this.t(), 0.02);
  }

  /** value in -1..1 → -26 dB..+12 dB with kill at -1 */
  setEq(band: 'low' | 'mid' | 'high', v: number) {
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    const db = v < 0 ? v * 26 : v * 12;
    if (v <= -0.995) {
      // full kill: push shelf/peak to its floor (-40 dB is inaudible)
      node.gain.setTargetAtTime(-40, this.t(), 0.02);
    } else node.gain.setTargetAtTime(db, this.t(), 0.02);
  }

  /** 0..1 dual filter: <0.5 low-pass sweep, >0.5 high-pass sweep, 0.5 = bypass. */
  setFilter(v: number) {
    this._filter = v;
    const t = this.t();
    if (v < 0.5) {
      const x = v / 0.5; // 0..1
      const f = 40 * Math.pow(20000 / 40, x); // 40..20000 log
      this.filterLP.frequency.setTargetAtTime(f, t, 0.015);
      this.filterLP.Q.setTargetAtTime(0.7 + (1 - x) * 4, t, 0.015);
      this.filterHP.frequency.setTargetAtTime(10, t, 0.015);
      this.filterHP.Q.setTargetAtTime(0.7, t, 0.015);
    } else {
      const x = (v - 0.5) / 0.5;
      const f = 20 * Math.pow(15000 / 20, x);
      this.filterHP.frequency.setTargetAtTime(f, t, 0.015);
      this.filterHP.Q.setTargetAtTime(0.7 + x * 4, t, 0.015);
      this.filterLP.frequency.setTargetAtTime(22050, t, 0.015);
      this.filterLP.Q.setTargetAtTime(0.7, t, 0.015);
    }
  }
  get filter() {
    return this._filter;
  }

  /** 0..1 fader with a gentle log curve */
  setFader(v: number) {
    this._faderValue = v;
    const g = v <= 0 ? 0 : Math.pow(v, 1.6);
    this.fader.gain.setTargetAtTime(g, this.t(), 0.008);
  }
  get faderValue() {
    return this._faderValue;
  }

  setXfGain(g: number) {
    this._xfValue = g;
    this.xfGain.gain.setTargetAtTime(g, this.t(), 0.008);
  }
  get xfValue() {
    return this._xfValue;
  }

  setCue(on: boolean) {
    this.cueTap.gain.setTargetAtTime(on ? 1 : 0, this.t(), 0.02);
  }

  /** Effective linear volume for stream backends (fader × xf). */
  get effectiveVolume() {
    const g = this._faderValue <= 0 ? 0 : Math.pow(this._faderValue, 1.6);
    return Math.max(0, Math.min(1, g * this._xfValue));
  }

  updateMeter() {
    this.analyser.getFloatTimeDomainData(this.analyserBuf as Float32Array<ArrayBuffer>);
    const { rms, peak } = rmsPeak(this.analyserBuf);
    this.peak = Math.max(peak, this.peak * 0.94);
    deckMeters[this.id].set({ l: rms, r: rms, peakL: this.peak, peakR: this.peak });
  }
}
