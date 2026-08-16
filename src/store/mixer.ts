import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeckId } from '@/audio/engine/types';
import type { CrossfaderCurve, XfAssign } from '@/audio/engine/Crossfader';

export interface ChannelValues {
  gain: number; // -1..1 (dB trim offset ±12)
  high: number; // -1..1
  mid: number;
  low: number;
  filter: number; // 0..1, 0.5 = off
  fader: number; // 0..1
  cue: boolean;
}

export const defaultChannel = (): ChannelValues => ({ gain: 0, high: 0, mid: 0, low: 0, filter: 0.5, fader: 1, cue: false });

interface MixerState {
  channels: Record<DeckId, ChannelValues>;
  crossfader: number; // -1..1
  curve: CrossfaderCurve;
  assign: Record<DeckId, XfAssign>;
  master: number; // 0..1
  cueMix: number; // 0 = cue, 1 = master (headphone blend)
  cueVolume: number;
  setChannel: (id: DeckId, patch: Partial<ChannelValues>) => void;
  setCrossfader: (v: number) => void;
  setCurve: (c: CrossfaderCurve) => void;
  setAssign: (id: DeckId, a: XfAssign) => void;
  setMaster: (v: number) => void;
  setCueMix: (v: number) => void;
  setCueVolume: (v: number) => void;
}

export const useMixer = create<MixerState>()(
  persist(
    (set) => ({
      channels: { A: defaultChannel(), B: defaultChannel(), C: defaultChannel(), D: defaultChannel() },
      crossfader: 0,
      curve: 'power',
      assign: { A: 'A', B: 'B', C: 'A', D: 'B' },
      master: 0.85,
      cueMix: 0,
      cueVolume: 0.8,
      setChannel: (id, patch) => set((s) => ({ channels: { ...s.channels, [id]: { ...s.channels[id], ...patch } } })),
      setCrossfader: (v) => set({ crossfader: Math.max(-1, Math.min(1, v)) }),
      setCurve: (curve) => set({ curve }),
      setAssign: (id, a) => set((s) => ({ assign: { ...s.assign, [id]: a } })),
      setMaster: (master) => set({ master }),
      setCueMix: (cueMix) => set({ cueMix }),
      setCueVolume: (cueVolume) => set({ cueVolume }),
    }),
    { name: 'djkado.mixer', partialize: (s) => ({ curve: s.curve, master: s.master, assign: s.assign }) },
  ),
);
