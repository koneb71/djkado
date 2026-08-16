import { masterMeter } from '@/store/runtime';

/**
 * Master bus: input → masterGain → limiter → (analysers L/R) → destination
 *                                        └→ recording MediaStreamDestination (lazily created)
 */
export class MasterBus {
  readonly input: GainNode;
  readonly masterGain: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly cueInput: GainNode; // headphone cue bus (mixed to master via cueMix when no second output)
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
    this.cueInput.gain.value = 0;

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
    this.cueInput.connect(this.masterGain);
    this.masterGain.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.limiter.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
  }

  setMasterGain(v: number) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
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
