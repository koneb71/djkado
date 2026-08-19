import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { throttledStorage } from '@/store/throttledStorage';
import { deleteStoredSample, getStoredSamples, putStoredSample } from '@/services/localLibrary/db';

export type PadMode = 'oneshot' | 'hold' | 'loop';

export interface PadState {
  id: string; // `${bank}-${index}`
  bank: number;
  index: number;
  name: string;
  color: string;
  mode: PadMode;
  gain: number;
  hasSample: boolean;
  playing: boolean;
  durationSec: number;
}

const PAD_COLORS = ['#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ef4444'];
export const PADS_PER_BANK = 8;
export const BANKS = 2;

interface SamplerStore {
  pads: Record<string, PadState>;
  bank: number;
  volume: number;
  setBank: (b: number) => void;
  setVolume: (v: number) => void;
  update: (id: string, p: Partial<PadState>) => void;
}

const defaultPads = () => {
  const pads: Record<string, PadState> = {};
  for (let b = 0; b < BANKS; b++)
    for (let i = 0; i < PADS_PER_BANK; i++)
      pads[`${b}-${i}`] = { id: `${b}-${i}`, bank: b, index: i, name: `Pad ${i + 1}`, color: PAD_COLORS[i], mode: 'oneshot', gain: 1, hasSample: false, playing: false, durationSec: 0 };
  return pads;
};

export const useSampler = create<SamplerStore>()(
  persist(
    (set) => ({
      pads: defaultPads(),
      bank: 0,
      volume: 0.9,
      setBank: (bank) => set({ bank }),
      setVolume: (volume) => set({ volume }),
      update: (id, p) => set((s) => ({ pads: { ...s.pads, [id]: { ...s.pads[id], ...p } } })),
    }),
    {
      name: 'djkado.sampler',
      storage: throttledStorage(),
      // pad mode/gain/name/colour are user settings; hasSample/playing/durationSec follow the
      // buffers that Sampler restores from IndexedDB, so they are rebuilt rather than trusted.
      partialize: (s) => ({
        volume: s.volume,
        pads: Object.fromEntries(Object.entries(s.pads).map(([k, p]) => [k, { mode: p.mode, gain: p.gain, name: p.name, color: p.color }])),
      }),
      merge: (persisted, current) => {
        const p = persisted as { volume?: number; pads?: Record<string, Partial<PadState>> } | undefined;
        if (!p) return current;
        const pads = { ...current.pads };
        for (const [k, v] of Object.entries(p.pads ?? {})) if (pads[k]) pads[k] = { ...pads[k], ...v, hasSample: false, playing: false, durationSec: 0 };
        return { ...current, pads, volume: p.volume ?? current.volume };
      },
    },
  ),
);

/**
 * 2 banks × 8 pads sampler. Each pad holds an AudioBuffer; triggers spawn a
 * fresh AudioBufferSourceNode → pad gain → sampler bus → master.
 */
export class Sampler {
  readonly output: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private padGains = new Map<string, GainNode>();
  private unsub: () => void;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.output = ctx.createGain();
    this.output.gain.value = useSampler.getState().volume;
    this.output.connect(dest);
    this.unsub = useSampler.subscribe((s) => this.output.gain.setTargetAtTime(s.volume, ctx.currentTime, 0.02));
    // built-in demo samples (synthesized) so the sampler works out of the box
    this.generateBuiltins();
    // …then overlay whatever the user loaded in an earlier session
    void this.restore();
  }

  private padGain(id: string) {
    let g = this.padGains.get(id);
    if (!g) {
      g = this.ctx.createGain();
      g.connect(this.output);
      this.padGains.set(id, g);
    }
    return g;
  }

  setSample(id: string, buffer: AudioBuffer, name?: string) {
    this.buffers.set(id, buffer);
    useSampler.getState().update(id, { hasSample: true, durationSec: buffer.duration, ...(name ? { name } : {}) });
  }

  clear(id: string) {
    this.stop(id);
    this.buffers.delete(id);
    useSampler.getState().update(id, { hasSample: false, durationSec: 0, name: `Pad ${Number(id.split('-')[1]) + 1}` });
    void deleteStoredSample(id); // …otherwise it would come back on the next launch
  }

  hasSample(id: string) {
    return this.buffers.has(id);
  }
  getBuffer(id: string) {
    return this.buffers.get(id) ?? null;
  }

  trigger(id: string, rate = 1) {
    const buf = this.buffers.get(id);
    if (!buf) return;
    const pad = useSampler.getState().pads[id];
    if (pad.mode === 'loop' && this.voices.has(id)) {
      this.stop(id);
      return;
    }
    this.stop(id, 0.005);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.loop = pad.mode === 'loop';
    const gain = this.ctx.createGain();
    gain.gain.value = pad.gain;
    src.connect(gain);
    gain.connect(this.padGain(id));
    src.start();
    this.voices.set(id, { src, gain });
    useSampler.getState().update(id, { playing: true });
    src.onended = () => {
      if (this.voices.get(id)?.src === src) {
        this.voices.delete(id);
        useSampler.getState().update(id, { playing: false });
      }
    };
  }

  release(id: string) {
    const pad = useSampler.getState().pads[id];
    if (pad?.mode === 'hold') this.stop(id, 0.02);
  }

  stop(id: string, fade = 0.02) {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, fade / 3);
    const src = v.src;
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* noop */
      }
    }, fade * 1000 + 10);
    this.voices.delete(id);
    useSampler.getState().update(id, { playing: false });
  }

  stopAll() {
    for (const id of [...this.voices.keys()]) this.stop(id);
  }

  async loadFile(id: string, file: File) {
    const bytes = await file.arrayBuffer();
    const name = file.name.replace(/\.[^.]+$/, '');
    // decodeAudioData detaches the buffer, so keep a copy for the cache
    const buf = await this.ctx.decodeAudioData(bytes.slice(0));
    this.setSample(id, buf, name);
    const pad = useSampler.getState().pads[id];
    void putStoredSample({
      id,
      name,
      blob: new Blob([bytes], { type: file.type || 'audio/*' }),
      bank: pad?.bank ?? 0,
      pad: pad?.index ?? 0,
      mode: pad?.mode ?? 'oneshot',
      color: pad?.color ?? '#f97316',
    });
  }

  /** Re-load user samples saved in a previous session. */
  private async restore() {
    const rows = await getStoredSamples();
    for (const row of rows) {
      try {
        const buf = await this.ctx.decodeAudioData(await row.blob.arrayBuffer());
        this.setSample(row.id, buf, row.name);
      } catch {
        // unsupported/corrupt sample — drop it so it stops failing every launch
        void deleteStoredSample(row.id);
      }
    }
  }

  /** Synthesized starter kit: kick, snare, clap, hat, air horn, riser, siren, vox-ish stab. */
  private generateBuiltins() {
    const sr = this.ctx.sampleRate;
    const mk = (sec: number, fn: (t: number, i: number) => number) => {
      const n = Math.floor(sec * sr);
      const b = this.ctx.createBuffer(1, n, sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = fn(i / sr, i);
      return b;
    };
    const noise = () => Math.random() * 2 - 1;
    const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
    this.setSample('0-0', mk(0.5, (t) => Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * env(t, 0.002, 0.12)), 'Kick');
    this.setSample('0-1', mk(0.35, (t) => (noise() * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * env(t, 0.001, 0.08)), 'Snare');
    this.setSample('0-2', mk(0.3, (t) => noise() * (env(t, 0.001, 0.02) + 0.6 * env(Math.max(0, t - 0.012), 0.001, 0.02) + 0.5 * env(Math.max(0, t - 0.024), 0.001, 0.08))), 'Clap');
    this.setSample('0-3', mk(0.12, (t) => noise() * env(t, 0.001, 0.025) * (Math.random() > 0.5 ? 1 : 0.7)), 'Hat');
    this.setSample('0-4', mk(1.2, (t) => (Math.sin(2 * Math.PI * 440 * t) + 0.5 * Math.sin(2 * Math.PI * 660 * t + Math.sin(t * 40))) * 0.5 * env(t, 0.05, 0.5)), 'Horn');
    this.setSample('0-5', mk(2.0, (t) => noise() * 0.5 * (t / 2) * (t / 2) + Math.sin(2 * Math.PI * (200 + 1400 * t) * t) * 0.15), 'Riser');
    this.setSample('0-6', mk(1.5, (t) => Math.sin(2 * Math.PI * (600 + 300 * Math.sin(2 * Math.PI * 2 * t)) * t) * 0.5 * env(t, 0.01, 0.9)), 'Siren');
    this.setSample('0-7', mk(0.4, (t) => (Math.sign(Math.sin(2 * Math.PI * 110 * t)) * 0.4 + Math.sin(2 * Math.PI * 220 * t) * 0.3) * env(t, 0.005, 0.1)), 'Stab');
    useSampler.getState().update('0-5', { mode: 'oneshot' });
  }

  dispose() {
    this.unsub();
    this.stopAll();
  }
}
