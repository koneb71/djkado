import { create } from 'zustand';
import { FULL_CAPS, type DeckId, type DeckSnapshot, DECK_IDS } from '@/audio/engine/types';

export function emptyDeck(id: DeckId): DeckSnapshot {
  return {
    id,
    track: null,
    loading: false,
    analyzing: false,
    analysisProgress: 0,
    duration: 0,
    playing: false,
    bpm: 0,
    key: '',
    keyName: '',
    grid: null,
    pitch: 0,
    pitchRange: 0.08,
    rate: 1,
    keylock: false,
    keyShift: 0,
    slip: false,
    quantize: true,
    sync: false,
    isMaster: false,
    loop: { enabled: false, start: 0, end: 0 },
    autoLoopBeats: 4,
    hotCues: new Array(8).fill(null),
    cuePoint: 0,
    gainDb: 0,
    waveform: null,
    capabilities: FULL_CAPS,
    error: null,
  };
}

interface DecksState {
  decks: Record<DeckId, DeckSnapshot>;
  update: (id: DeckId, patch: Partial<DeckSnapshot> | ((d: DeckSnapshot) => Partial<DeckSnapshot>)) => void;
  reset: (id: DeckId) => void;
}

export const useDecks = create<DecksState>((set) => ({
  decks: Object.fromEntries(DECK_IDS.map((id) => [id, emptyDeck(id)])) as Record<DeckId, DeckSnapshot>,
  update: (id, patch) =>
    set((s) => {
      const cur = s.decks[id];
      const p = typeof patch === 'function' ? patch(cur) : patch;
      return { decks: { ...s.decks, [id]: { ...cur, ...p } } };
    }),
  reset: (id) => set((s) => ({ decks: { ...s.decks, [id]: emptyDeck(id) } })),
}));

export const useDeck = (id: DeckId) => useDecks((s) => s.decks[id]);
