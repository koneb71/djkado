import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeckId } from '@/audio/engine/types';
import type { StemName } from '@/audio/stems/models';

export type StemJobState = 'idle' | 'queued' | 'downloading' | 'loading' | 'separating' | 'encoding' | 'ready' | 'error';

export interface StemJob {
  state: StemJobState;
  progress: number; // 0..1 (of current stage)
  engine?: 'webgpu' | 'wasm';
  loadedBytes?: number;
  totalBytes?: number;
  etaSec?: number;
  error?: string;
  startedAt?: number;
}

export interface DeckStems {
  available: boolean; // stems attached in the worklet
  active: boolean; // stems mode on (mix from stems)
  gains: Record<StemName, number>;
  mute: Record<StemName, boolean>;
  solo: Record<StemName, boolean>;
}

const defaultDeckStems = (): DeckStems => ({
  available: false,
  active: false,
  gains: { vocals: 1, drums: 1, bass: 1, other: 1 },
  mute: { vocals: false, drums: false, bass: false, other: false },
  solo: { vocals: false, drums: false, bass: false, other: false },
});

interface StemsState {
  jobs: Record<string, StemJob>; // by trackId
  ready: Record<string, true>; // trackIds known to have cached stems
  decks: Record<DeckId, DeckStems>;
  autoPrepare: boolean;
  webgpu: boolean | null;
  modelCached: boolean | null;
  setJob: (trackId: string, patch: Partial<StemJob>) => void;
  clearJob: (trackId: string) => void;
  markReady: (trackId: string, ready: boolean) => void;
  setDeck: (id: DeckId, patch: Partial<DeckStems>) => void;
  setAutoPrepare: (b: boolean) => void;
  setCaps: (p: { webgpu?: boolean; modelCached?: boolean }) => void;
}

export const useStems = create<StemsState>()(
  persist(
    (set) => ({
      jobs: {},
      ready: {},
      decks: { A: defaultDeckStems(), B: defaultDeckStems(), C: defaultDeckStems(), D: defaultDeckStems() },
      autoPrepare: false,
      webgpu: null,
      modelCached: null,
      setJob: (trackId, patch) => set((s) => ({ jobs: { ...s.jobs, [trackId]: { ...(s.jobs[trackId] ?? { state: 'idle', progress: 0 }), ...patch } } })),
      clearJob: (trackId) =>
        set((s) => {
          const jobs = { ...s.jobs };
          delete jobs[trackId];
          return { jobs };
        }),
      markReady: (trackId, ready) =>
        set((s) => {
          const r = { ...s.ready };
          if (ready) r[trackId] = true;
          else delete r[trackId];
          return { ready: r };
        }),
      setDeck: (id, patch) => set((s) => ({ decks: { ...s.decks, [id]: { ...s.decks[id], ...patch } } })),
      setAutoPrepare: (autoPrepare) => set({ autoPrepare }),
      setCaps: (p) => set(p),
    }),
    { name: 'djkado.stems', partialize: (s) => ({ autoPrepare: s.autoPrepare, ready: s.ready }) },
  ),
);

/** Effective linear gain per stem given mute/solo. */
export function effectiveStemGains(d: DeckStems): Record<StemName, number> {
  const anySolo = Object.values(d.solo).some(Boolean);
  const out = {} as Record<StemName, number>;
  (Object.keys(d.gains) as StemName[]).forEach((n) => {
    out[n] = d.mute[n] || (anySolo && !d.solo[n]) ? 0 : d.gains[n];
  });
  return out;
}
