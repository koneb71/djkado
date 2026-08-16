import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeckId } from '@/audio/engine/types';

export type Layout = 2 | 4;

interface UiState {
  layout: Layout;
  libraryHeight: number;
  libraryOpen: boolean;
  fxOpen: Record<DeckId, boolean>;
  samplerOpen: boolean;
  settingsOpen: boolean;
  keyboardHelpOpen: boolean;
  focusedDeck: DeckId;
  vinylMode: boolean;
  waveformZoom: number; // seconds visible in the scrolling waveform
  setLayout: (l: Layout) => void;
  setLibraryHeight: (h: number) => void;
  setLibraryOpen: (b: boolean) => void;
  toggleFx: (id: DeckId) => void;
  setSamplerOpen: (b: boolean) => void;
  setSettingsOpen: (b: boolean) => void;
  setKeyboardHelpOpen: (b: boolean) => void;
  setFocusedDeck: (id: DeckId) => void;
  setVinylMode: (b: boolean) => void;
  setWaveformZoom: (z: number) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      layout: 2,
      libraryHeight: 300,
      libraryOpen: true,
      fxOpen: { A: false, B: false, C: false, D: false },
      samplerOpen: false,
      settingsOpen: false,
      keyboardHelpOpen: false,
      focusedDeck: 'A',
      vinylMode: true,
      waveformZoom: 8,
      setLayout: (layout) => set({ layout }),
      setLibraryHeight: (libraryHeight) => set({ libraryHeight: Math.max(160, Math.min(700, libraryHeight)) }),
      setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
      toggleFx: (id) => set((s) => ({ fxOpen: { ...s.fxOpen, [id]: !s.fxOpen[id] } })),
      setSamplerOpen: (samplerOpen) => set({ samplerOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setKeyboardHelpOpen: (keyboardHelpOpen) => set({ keyboardHelpOpen }),
      setFocusedDeck: (focusedDeck) => set({ focusedDeck }),
      setVinylMode: (vinylMode) => set({ vinylMode }),
      setWaveformZoom: (z) => set({ waveformZoom: Math.max(2, Math.min(40, z)) }),
    }),
    { name: 'djkado.ui', partialize: (s) => ({ layout: s.layout, libraryHeight: s.libraryHeight, libraryOpen: s.libraryOpen, vinylMode: s.vinylMode, waveformZoom: s.waveformZoom, samplerOpen: s.samplerOpen }) },
  ),
);
