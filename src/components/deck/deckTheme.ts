import type { DeckId } from '@/audio/engine/types';

export const DECK_COLORS: Record<DeckId, string> = {
  A: '#22d3ee',
  B: '#f59e0b',
  C: '#a78bfa',
  D: '#f472b6',
};

export const deckColor = (id: DeckId) => DECK_COLORS[id];
