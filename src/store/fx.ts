import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { throttledStorage } from './throttledStorage';
import type { DeckId } from '@/audio/engine/types';
import type { FxKind } from '@/audio/fx/FxUnit';
import { FX_SLOTS } from '@/audio/fx/FxChain';

export interface FxSlotState {
  kind: FxKind | null;
  enabled: boolean;
  mix: number;
  params: Record<string, number>;
}

interface FxState {
  decks: Record<DeckId, FxSlotState[]>;
  setSlot: (deck: DeckId, slot: number, patch: Partial<FxSlotState>) => void;
}

const emptySlots = (): FxSlotState[] => Array.from({ length: FX_SLOTS }, () => ({ kind: null, enabled: false, mix: 0.5, params: {} }));

export const useFx = create<FxState>()(
  persist(
    (set) => ({
      decks: { A: emptySlots(), B: emptySlots(), C: emptySlots(), D: emptySlots() },
      setSlot: (deck, slot, patch) =>
        set((s) => {
          const arr = [...s.decks[deck]];
          arr[slot] = { ...arr[slot], ...patch };
          return { decks: { ...s.decks, [deck]: arr } };
        }),
    }),
    {
      name: 'djkado.fx',
      storage: throttledStorage(),
      partialize: (s) => ({ decks: s.decks }),
      // slot count may change between versions — pad/trim to the current FX_SLOTS
      merge: (persisted, current) => {
        const p = persisted as Partial<FxState> | undefined;
        if (!p?.decks) return current;
        const decks = { ...current.decks };
        for (const id of Object.keys(decks) as (keyof FxState['decks'])[]) {
          const saved = p.decks[id] ?? [];
          decks[id] = emptySlots().map((empty, i) => ({ ...empty, ...(saved[i] ?? {}) }));
        }
        return { ...current, decks };
      },
    },
  ),
);
