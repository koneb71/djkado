/// <reference types="@types/audioworklet" />
import { createPlayerState, renderBlock, type PlayerState } from './deck-player-core';

interface PendingSeek {
  pos: number;
  ctxTime: number;
}

class DeckPlayerProcessor extends AudioWorkletProcessor {
  private state: PlayerState = createPlayerState();
  private quantaSinceReport = 0;
  private reportEvery = 4; // ~11.6ms @ 44.1k
  private pendingSeek: PendingSeek | null = null;
  private scratching = false;
  private wasPlayingBeforeScratch = false;
  private lastRate = 1;
  private disposed = false;

  static get parameterDescriptors() {
    return [
      {
        name: 'rate',
        defaultValue: 1,
        minValue: -8,
        maxValue: 8,
        automationRate: 'a-rate' as AutomationRate,
      },
    ];
  }

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => this.handleMessage(e.data);
  }

  private handleMessage(msg: any) {
    const s = this.state;
    switch (msg.type) {
      case 'load': {
        const buffers: ArrayBuffer[] = msg.channels;
        s.channels = buffers.map((b) => new Float32Array(b));
        s.srcRate = msg.sampleRate;
        s.length = s.channels[0]?.length ?? 0;
        s.pos = 0;
        s.slipPos = 0;
        s.playing = false;
        s.ended = false;
        s.loop = { enabled: false, start: 0, end: 0 };
        this.pendingSeek = null;
        this.post({ type: 'loaded', length: s.length, sampleRate: s.srcRate });
        this.report(true);
        break;
      }
      case 'unload':
        s.channels = [];
        s.length = 0;
        s.pos = 0;
        s.playing = false;
        break;
      case 'play':
        if (s.length > 0) {
          if (s.pos >= s.length) s.pos = 0;
          s.playing = true;
          s.ended = false;
          if (s.slipEnabled) s.slipPos = s.pos;
        }
        this.report(true);
        break;
      case 'pause':
        s.playing = false;
        this.wasPlayingBeforeScratch = false;
        this.report(true);
        break;
      case 'seek':
        s.pos = Math.max(0, Math.min(s.length, msg.pos));
        if (msg.resetSlip !== false) s.slipPos = s.pos;
        s.ended = false;
        this.report(true);
        break;
      case 'seekAtTime':
        this.pendingSeek = { pos: msg.pos, ctxTime: msg.ctxTime };
        break;
      case 'setLoop':
        s.loop = { enabled: !!msg.enabled, start: msg.start ?? s.loop.start, end: msg.end ?? s.loop.end };
        break;
      case 'setSlip':
        if (msg.enabled && !s.slipEnabled) s.slipPos = s.pos;
        s.slipEnabled = !!msg.enabled;
        break;
      case 'slipReturn':
        // jump the real playhead back to the shadow position (used when leaving loop/scratch in slip mode)
        if (s.slipEnabled) {
          s.pos = Math.max(0, Math.min(s.length, s.slipPos));
          this.report(true);
        }
        break;
      case 'setNominalRate':
        s.nominalRate = msg.rate;
        break;
      case 'setInterp':
        s.interp = msg.interp === 'linear' ? 'linear' : 'cubic';
        break;
      case 'scratch':
        if (msg.on && !this.scratching) {
          this.scratching = true;
          this.wasPlayingBeforeScratch = s.playing;
          if (s.slipEnabled && !s.playing) s.slipPos = s.pos;
          s.playing = true;
        } else if (!msg.on && this.scratching) {
          this.scratching = false;
          s.playing = this.wasPlayingBeforeScratch;
          if (s.slipEnabled && s.playing) s.pos = Math.max(0, Math.min(s.length, s.slipPos));
          this.report(true);
        }
        break;
      case 'capture': {
        const start = Math.max(0, Math.min(s.length, Math.floor(msg.start)));
        const end = Math.max(start, Math.min(s.length, Math.floor(msg.end)));
        const chans = s.channels.map((c) => c.slice(start, end));
        this.port.postMessage(
          { type: 'capture', id: msg.id, sampleRate: s.srcRate, channels: chans.map((c) => c.buffer) },
          chans.map((c) => c.buffer),
        );
        break;
      }
      case 'setReportInterval':
        this.reportEvery = Math.max(1, msg.quanta | 0);
        break;
      case 'dispose':
        this.disposed = true;
        s.channels = [];
        break;
    }
  }

  private post(msg: any) {
    this.port.postMessage(msg);
  }

  private report(force = false) {
    if (!force && ++this.quantaSinceReport < this.reportEvery) return;
    this.quantaSinceReport = 0;
    const s = this.state;
    this.post({
      type: 'pos',
      pos: s.pos,
      slipPos: s.slipPos,
      ctxTime: currentTime,
      rate: s.playing ? this.lastRate : 0,
      playing: s.playing,
    });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (this.disposed) return false;
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const frames = out[0].length;
    const rates = parameters.rate;
    const s = this.state;
    this.lastRate = rates[rates.length - 1];

    // Sample-accurate scheduled seek
    if (this.pendingSeek) {
      const dt = this.pendingSeek.ctxTime - currentTime;
      const offsetFrames = Math.round(dt * sampleRate);
      if (offsetFrames <= 0) {
        s.pos = Math.max(0, Math.min(s.length, this.pendingSeek.pos));
        s.slipPos = s.pos;
        this.pendingSeek = null;
      } else if (offsetFrames < frames) {
        // render first part, seek, render rest
        const first = out.map((c) => c.subarray(0, offsetFrames));
        const rest = out.map((c) => c.subarray(offsetFrames));
        const r1 = rates.length === 1 ? rates : rates.subarray(0, offsetFrames);
        const r2 = rates.length === 1 ? rates : rates.subarray(offsetFrames);
        renderBlock(s, r1, first, offsetFrames, sampleRate);
        s.pos = Math.max(0, Math.min(s.length, this.pendingSeek.pos));
        s.slipPos = s.pos;
        this.pendingSeek = null;
        const ev = renderBlock(s, r2, rest, frames - offsetFrames, sampleRate);
        if (ev.ended) this.post({ type: 'ended' });
        this.report();
        return true;
      }
    }

    const ev = renderBlock(s, rates, out, frames, sampleRate);
    if (ev.ended) this.post({ type: 'ended' });
    if (ev.loopWrapped) this.post({ type: 'loopWrap' });
    this.report();
    return true;
  }
}

registerProcessor('deck-player', DeckPlayerProcessor);
