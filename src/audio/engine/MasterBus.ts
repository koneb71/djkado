import { masterMeter } from '@/store/runtime';

/**
 * Master bus: input → masterGain → limiter → (analysers L/R) → destination
 *                                        └→ recording MediaStreamDestination (lazily created)
 *
 * Headphone / cue section:
 *   cueInput (Σ strip cue taps + pre-listen) ─┬→ cueToMaster (fallback blend when no phones output) → masterGain
 *                                            └→ cueBlend (1-cueMix) ─┐
 *   limiter → masterTap (cueMix) ────────────────────────────────────┴→ phones (volume) → [split L=cue/R=master] → phonesDest
 *   phonesDest.stream → second AudioContext (setSinkId = headphone device) → its destination
 */
export class MasterBus {
  readonly input: GainNode;
  readonly masterGain: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly cueInput: GainNode; // headphone cue bus
  private cueToMaster: GainNode;
  private cueBlend: GainNode;
  private masterTap: GainNode;
  private phones: GainNode;
  private phonesOut: GainNode; // last node before the phones destination (direct or split)
  private splitNodes: AudioNode[] = [];
  private phonesDest: MediaStreamAudioDestinationNode | null = null;
  private cueCtx: AudioContext | null = null;
  private cueSrc: MediaStreamAudioSourceNode | null = null;
  private cueDeviceId: string | null = null;
  private cueMix = 0;
  private cueVolume = 0.8;
  private anyCue = false;
  private split = false;
  private splitter: ChannelSplitterNode;
  private analyserL: AnalyserNode;
  private analyserR: AnalyserNode;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private bufL: Float32Array;
  private bufR: Float32Array;
  private peakL = 0;
  private peakR = 0;

  constructor(readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    this.cueInput = ctx.createGain();
    this.cueToMaster = ctx.createGain();
    this.cueToMaster.gain.value = 0;
    this.cueBlend = ctx.createGain();
    this.cueBlend.gain.value = 1;
    this.masterTap = ctx.createGain();
    this.masterTap.gain.value = 0;
    this.phones = ctx.createGain();
    this.phones.gain.value = 0.8;
    this.phonesOut = this.phones;

    this.splitter = ctx.createChannelSplitter(2);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = 512;
    this.analyserR.fftSize = 512;
    this.analyserL.smoothingTimeConstant = 0;
    this.analyserR.smoothingTimeConstant = 0;
    this.bufL = new Float32Array(this.analyserL.fftSize);
    this.bufR = new Float32Array(this.analyserR.fftSize);

    this.input.connect(this.masterGain);
    this.cueInput.connect(this.cueToMaster);
    this.cueToMaster.connect(this.masterGain);
    this.cueInput.connect(this.cueBlend);
    this.cueBlend.connect(this.phones);
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.masterTap);
    this.masterTap.connect(this.phones);
    this.limiter.connect(ctx.destination);
    this.limiter.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
  }

  setMasterGain(v: number) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  /* ------------------------------ headphones ------------------------------ */
  /** True when the cue bus is routed to a dedicated headphone output. */
  get headphonesActive() {
    return !!this.cueCtx && !!this.cueDeviceId;
  }
  get headphoneDeviceId() {
    return this.cueDeviceId;
  }
  static get canRouteHeadphones() {
    return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  }

  /** Update cue mix / volume / any-cue state (called from the mixer store). */
  setCue(opts: { cueMix?: number; cueVolume?: number; anyCue?: boolean }) {
    if (opts.cueMix !== undefined) this.cueMix = opts.cueMix;
    if (opts.cueVolume !== undefined) this.cueVolume = opts.cueVolume;
    if (opts.anyCue !== undefined) this.anyCue = opts.anyCue;
    this.applyCueGains();
  }

  private applyCueGains() {
    const t = this.ctx.currentTime;
    const phones = this.headphonesActive;
    // fallback: without a headphone output, blend the cue into the master when any cue is active
    this.cueToMaster.gain.setTargetAtTime(!phones && this.anyCue ? (1 - this.cueMix) * this.cueVolume * 0.6 : 0, t, 0.02);
    // headphone path
    this.cueBlend.gain.setTargetAtTime(this.split ? 1 : 1 - this.cueMix, t, 0.02);
    this.masterTap.gain.setTargetAtTime(this.split ? 1 : this.cueMix, t, 0.02);
    this.phones.gain.setTargetAtTime(this.cueVolume, t, 0.02);
  }

  /** Split cue: left ear = cue, right ear = master (mono each). */
  setSplitCue(on: boolean) {
    if (on === this.split) return;
    this.split = on;
    // rebuild the phones → destination path
    this.phones.disconnect();
    this.phonesOut.disconnect();
    for (const n of this.splitNodes) n.disconnect();
    this.splitNodes = [];
    if (on) {
      const ctx = this.ctx;
      const monoCue = ctx.createGain();
      monoCue.channelCount = 1;
      monoCue.channelCountMode = 'explicit';
      const monoMaster = ctx.createGain();
      monoMaster.channelCount = 1;
      monoMaster.channelCountMode = 'explicit';
      const merger = ctx.createChannelMerger(2);
      const out = ctx.createGain();
      // note: in split mode cueBlend/masterTap both sit at 1 (see applyCueGains) and the volume is applied by `phones`
      this.cueBlend.disconnect();
      this.masterTap.disconnect();
      this.cueBlend.connect(monoCue);
      this.masterTap.connect(monoMaster);
      monoCue.connect(merger, 0, 0);
      monoMaster.connect(merger, 0, 1);
      merger.connect(this.phones);
      this.phones.connect(out);
      this.phonesOut = out;
      this.splitNodes = [monoCue, monoMaster, merger];
    } else {
      this.cueBlend.disconnect();
      this.masterTap.disconnect();
      this.cueBlend.connect(this.phones);
      this.masterTap.connect(this.phones);
      this.phonesOut = this.phones;
    }
    if (this.phonesDest) this.phonesOut.connect(this.phonesDest);
    this.applyCueGains();
  }

  /**
   * Route the cue bus to a second output device (Chrome/Edge/Electron: AudioContext.setSinkId).
   * `null` returns to the fallback (cue blended into master).
   */
  async setHeadphoneDevice(deviceId: string | null): Promise<void> {
    if (!deviceId) {
      this.cueDeviceId = null;
      this.cueSrc?.disconnect();
      this.cueSrc = null;
      if (this.cueCtx) {
        const c = this.cueCtx;
        this.cueCtx = null;
        void c.close().catch(() => {});
      }
      this.applyCueGains();
      return;
    }
    if (!this.phonesDest) {
      this.phonesDest = this.ctx.createMediaStreamDestination();
      this.phonesOut.connect(this.phonesDest);
    }
    if (!this.cueCtx) {
      this.cueCtx = new AudioContext({ latencyHint: 'interactive', sampleRate: this.ctx.sampleRate });
      this.cueSrc = this.cueCtx.createMediaStreamSource(this.phonesDest.stream);
      this.cueSrc.connect(this.cueCtx.destination);
    }
    await (this.cueCtx as any).setSinkId(deviceId === 'default' ? '' : deviceId);
    this.cueDeviceId = deviceId;
    if (this.cueCtx.state !== 'running') await this.cueCtx.resume().catch(() => {});
    this.applyCueGains();
  }

  /** Resume the headphone context too (autoplay policy) — call from a user gesture. */
  async resumeAll() {
    if (this.cueCtx && this.cueCtx.state !== 'running') await this.cueCtx.resume().catch(() => {});
  }

  /** Stream that carries the master mix, for MediaRecorder. */
  getRecordingStream(): MediaStream {
    if (!this.recDest) {
      this.recDest = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recDest);
    }
    return this.recDest.stream;
  }

  /** Called from the shared rAF loop. */
  updateMeters() {
    this.analyserL.getFloatTimeDomainData(this.bufL as Float32Array<ArrayBuffer>);
    this.analyserR.getFloatTimeDomainData(this.bufR as Float32Array<ArrayBuffer>);
    const l = rmsPeak(this.bufL);
    const r = rmsPeak(this.bufR);
    this.peakL = Math.max(l.peak, this.peakL * 0.94);
    this.peakR = Math.max(r.peak, this.peakR * 0.94);
    masterMeter.set({ l: l.rms, r: r.rms, peakL: this.peakL, peakR: this.peakR });
  }
}

export function rmsPeak(buf: Float32Array): { rms: number; peak: number } {
  let s = 0;
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    s += v * v;
    const a = v < 0 ? -v : v;
    if (a > p) p = a;
  }
  return { rms: Math.sqrt(s / buf.length), peak: p };
}
