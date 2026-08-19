import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DECK_IDS, type DeckId } from '@/audio/engine/types';

export interface DeckPrefs {
  keylock: boolean;
  quantize: boolean;
  slip: boolean;
  autoLoopBeats: number;
}

const defaults = (): DeckPrefs => ({ keylock: false, quantize: true, slip: false, autoLoopBeats: 4 });

interface DeckPrefsState {
  decks: Record<DeckId, DeckPrefs>;
  set: (id: DeckId, patch: Partial<DeckPrefs>) => void;
}

/**
 * Per-deck switch positions that should survive a restart (they are settings, not transport state).
 * Deliberately excluded: loaded track, play state, pitch, pitch range (sync expands it on its own),
 * sync/master and loop — see restoreSession().
 */
export const useDeckPrefs = create<DeckPrefsState>()(
  persist(
    (set) => ({
      decks: Object.fromEntries(DECK_IDS.map((id) => [id, defaults()])) as Record<DeckId, DeckPrefs>,
      set: (id, patch) => set((s) => ({ decks: { ...s.decks, [id]: { ...s.decks[id], ...patch } } })),
    }),
    {
      name: 'djkado.deckPrefs',
      partialize: (s) => ({ decks: s.decks }),
      merge: (persisted, current) => {
        const p = persisted as Partial<DeckPrefsState> | undefined;
        if (!p?.decks) return current;
        const decks = { ...current.decks };
        for (const id of DECK_IDS) decks[id] = { ...defaults(), ...(p.decks[id] ?? {}) };
        return { ...current, decks };
      },
    },
  ),
);
