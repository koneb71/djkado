import { create } from 'zustand';
import type { DeckId } from '@/audio/engine/types';

export type MobileTab = 'decks' | 'library' | 'mix' | 'sampler';

interface MobileUiState {
  tab: MobileTab;
  mixDeck: DeckId; // deck shown in the Mix (FX/Stems/EQ) tab
  mixSection: 'mixer' | 'stems' | 'fx';
  setTab: (t: MobileTab) => void;
  setMixDeck: (d: DeckId) => void;
  setMixSection: (s: MobileUiState['mixSection']) => void;
}

export const useMobileUi = create<MobileUiState>((set) => ({
  tab: 'decks',
  mixDeck: 'A',
  mixSection: 'mixer',
  setTab: (tab) => set({ tab }),
  setMixDeck: (mixDeck) => set({ mixDeck }),
  setMixSection: (mixSection) => set({ mixSection }),
}));
