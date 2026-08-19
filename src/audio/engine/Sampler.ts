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
/** banks created on a fresh install */
export const DEFAULT_BANKS = 2;
export const MAX_BANKS = 12;

export interface SamplerBank {
  /** stable id, also the prefix of this bank's pad ids — never renumbered, so samples stay attached */
  id: number;
  name: string;
}

interface SamplerStore {
  pads: Record<string, PadState>;
  banks: SamplerBank[];
  /** next bank id to hand out — monotonic, so an id is never reused */
  nextBankId: number;
  /** the starter kit has been generated once; never re-seed over the user's banks */
  seeded: boolean;
  /** id of the selected bank */
  bank: number;
  volume: number;
  setBank: (b: number) => void;
  setVolume: (v: number) => void;
  update: (id: string, p: Partial<PadState>) => void;
  /** append a bank (returns its id, or null at MAX_BANKS) */
  addBank: (name?: string) => number | null;
  renameBank: (id: number, name: string) => void;
  /** forget a bank and its pads — the caller clears the audio/IndexedDB side (Sampler.removeBank) */
  removeBank: (id: number) => void;
}

const padsForBank = (bank: number): Record<string, PadState> => {
  const pads: Record<string, PadState> = {};
  for (let i = 0; i < PADS_PER_BANK; i++)
    pads[`${bank}-${i}`] = { id: `${bank}-${i}`, bank, index: i, name: `Pad ${i + 1}`, color: PAD_COLORS[i], mode: 'oneshot', gain: 1, hasSample: false, playing: false, durationSec: 0 };
  return pads;
};

const defaultBanks = (): SamplerBank[] => Array.from({ length: DEFAULT_BANKS }, (_, i) => ({ id: i, name: `Bank ${i + 1}` }));

const defaultPads = (banks: SamplerBank[] = defaultBanks()) => Object.assign({}, ...banks.map((b) => padsForBank(b.id))) as Record<string, PadState>;

export const useSampler = create<SamplerStore>()(
  persist(
    (set, get) => ({
      pads: defaultPads(),
      banks: defaultBanks(),
      nextBankId: DEFAULT_BANKS,
      seeded: false,
      bank: 0,
      volume: 0.9,
      setBank: (bank) => set({ bank }),
      setVolume: (volume) => set({ volume }),
      update: (id, p) => set((s) => ({ pads: { ...s.pads, [id]: { ...s.pads[id], ...p } } })),
      addBank: (name) => {
        const { banks, nextBankId } = get();
        if (banks.length >= MAX_BANKS) return null;
        // ids are never reused: a pad id must keep pointing at the same stored sample
        const id = Math.max(nextBankId, banks.reduce((max, b) => Math.max(max, b.id + 1), 0));
        set((s) => ({
          banks: [...s.banks, { id, name: name?.trim() || `Bank ${id + 1}` }],
          pads: { ...s.pads, ...padsForBank(id) },
          nextBankId: id + 1,
          bank: id,
        }));
        return id;
      },
      renameBank: (id, name) => set((s) => ({ banks: s.banks.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)) })),
      removeBank: (id) =>
        set((s) => {
          if (s.banks.length <= 1) return s; // always keep one
          const banks = s.banks.filter((b) => b.id !== id);
          const pads = Object.fromEntries(Object.entries(s.pads).filter(([, p]) => p.bank !== id));
          return { banks, pads, bank: s.bank === id ? banks[0].id : s.bank };
        }),
    }),
    {
      name: 'djkado.sampler',
      storage: throttledStorage(),
      // pad mode/gain/name/colour are user settings; hasSample/playing/durationSec follow the
      // buffers that Sampler restores from IndexedDB, so they are rebuilt rather than trusted.
      partialize: (s) => ({
        volume: s.volume,
        banks: s.banks,
        bank: s.bank,
        nextBankId: s.nextBankId,
        seeded: s.seeded,
        pads: Object.fromEntries(Object.entries(s.pads).map(([k, p]) => [k, { mode: p.mode, gain: p.gain, name: p.name, color: p.color }])),
      }),
      merge: (persisted, current) => {
        const p = persisted as { volume?: number; bank?: number; banks?: SamplerBank[]; nextBankId?: number; seeded?: boolean; pads?: Record<string, Partial<PadState>> } | undefined;
        if (!p) return current;
        const banks = p.banks?.length ? p.banks : current.banks;
        // rebuild the pad rows for whatever banks were saved, then overlay the saved pad settings
        const pads = defaultPads(banks);
        for (const [k, v] of Object.entries(p.pads ?? {})) if (pads[k]) pads[k] = { ...pads[k], ...v, hasSample: false, playing: false, durationSec: 0 };
        const bank = banks.some((b) => b.id === p.bank) ? p.bank! : banks[0].id;
        const nextBankId = Math.max(p.nextBankId ?? 0, ...banks.map((b) => b.id + 1));
        return { ...current, banks, pads, bank, nextBankId, seeded: p.seeded ?? false, volume: p.volume ?? current.volume };
      },
    },
  ),
);

/**
 * Sampler with a user-defined number of banks × 8 pads. Each pad holds an AudioBuffer; triggers
 * spawn a fresh AudioBufferSourceNode → pad gain → sampler bus → master.
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
    // built-in demo samples (synthesized) so the sampler works out of the box — once ever,
    // otherwise they would reappear in whichever bank happens to be first after edits
    if (!useSampler.getState().seeded) {
      this.generateBuiltins();
      useSampler.setState({ seeded: true });
    }
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
    // ignore pads whose bank was deleted — never conjure a half-built pad row
    if (!useSampler.getState().pads[id]) return;
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
    if (!useSampler.getState().pads[id]) throw new Error('That pad no longer exists');
    const bytes = await file.arrayBuffer();
    const name = file.name.replace(/\.[^.]+$/, '');
    // decodeAudioData detaches the buffer, so keep a copy for the cache
    const buf = await this.ctx.decodeAudioData(bytes.slice(0));
    const pad = useSampler.getState().pads[id];
    if (!pad) throw new Error('That pad no longer exists'); // bank deleted while decoding
    this.setSample(id, buf, name);
    void putStoredSample({
      id,
      name,
      blob: new Blob([bytes], { type: file.type || 'audio/*' }),
      bank: pad.bank,
      pad: pad.index,
      mode: pad.mode,
      color: pad.color,
    });
  }

  /** Remove a bank: stop and forget its pads, and drop their saved samples. */
  async removeBank(bankId: number) {
    const state = useSampler.getState();
    if (state.banks.length <= 1 || !state.banks.some((b) => b.id === bankId)) return;
    const ids = Object.values(useSampler.getState().pads)
      .filter((p) => p.bank === bankId)
      .map((p) => p.id);
    for (const id of ids) {
      this.stop(id);
      this.buffers.delete(id);
      this.padGains.get(id)?.disconnect();
      this.padGains.delete(id);
    }
    useSampler.getState().removeBank(bankId);
    await Promise.all(ids.map((id) => deleteStoredSample(id)));
  }

  /** Re-load user samples saved in a previous session. */
  private async restore() {
    const rows = await getStoredSamples();
    const pads = useSampler.getState().pads;
    for (const row of rows) {
      if (!pads[row.id]) {
        // pad belongs to a bank that no longer exists
        void deleteStoredSample(row.id);
        continue;
      }
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
    // the starter kit lives on the first bank — which is not necessarily id 0 once the user
    // has added and removed banks
    const b = useSampler.getState().banks[0]?.id ?? 0;
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
    this.setSample(`${b}-0`, mk(0.5, (t) => Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * env(t, 0.002, 0.12)), 'Kick');
    this.setSample(`${b}-1`, mk(0.35, (t) => (noise() * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * env(t, 0.001, 0.08)), 'Snare');
    this.setSample(`${b}-2`, mk(0.3, (t) => noise() * (env(t, 0.001, 0.02) + 0.6 * env(Math.max(0, t - 0.012), 0.001, 0.02) + 0.5 * env(Math.max(0, t - 0.024), 0.001, 0.08))), 'Clap');
    this.setSample(`${b}-3`, mk(0.12, (t) => noise() * env(t, 0.001, 0.025) * (Math.random() > 0.5 ? 1 : 0.7)), 'Hat');
    this.setSample(`${b}-4`, mk(1.2, (t) => (Math.sin(2 * Math.PI * 440 * t) + 0.5 * Math.sin(2 * Math.PI * 660 * t + Math.sin(t * 40))) * 0.5 * env(t, 0.05, 0.5)), 'Horn');
    this.setSample(`${b}-5`, mk(2.0, (t) => noise() * 0.5 * (t / 2) * (t / 2) + Math.sin(2 * Math.PI * (200 + 1400 * t) * t) * 0.15), 'Riser');
    this.setSample(`${b}-6`, mk(1.5, (t) => Math.sin(2 * Math.PI * (600 + 300 * Math.sin(2 * Math.PI * 2 * t)) * t) * 0.5 * env(t, 0.01, 0.9)), 'Siren');
    this.setSample(`${b}-7`, mk(0.4, (t) => (Math.sign(Math.sin(2 * Math.PI * 110 * t)) * 0.4 + Math.sin(2 * Math.PI * 220 * t) * 0.3) * env(t, 0.005, 0.1)), 'Stab');
    useSampler.getState().update(`${b}-5`, { mode: 'oneshot' });
  }

  dispose() {
    this.unsub();
    this.stopAll();
  }
}
