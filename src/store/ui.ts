import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeckId } from '@/audio/engine/types';

export type Layout = 2 | 4;
export type PadMode = 'hotcue' | 'roll' | 'slicer' | 'beatjump';
export const PAD_MODES: { id: PadMode; label: string }[] = [
  { id: 'hotcue', label: 'Cue' },
  { id: 'roll', label: 'Roll' },
  { id: 'slicer', label: 'Slicer' },
  { id: 'beatjump', label: 'Jump' },
];

interface UiState {
  layout: Layout;
  libraryHeight: number;
  libraryOpen: boolean;
  fxOpen: Record<DeckId, boolean>;
  stemsOpen: Record<DeckId, boolean>;
  padMode: Record<DeckId, PadMode>;
  samplerOpen: boolean;
  settingsOpen: boolean;
  keyboardHelpOpen: boolean;
  focusedDeck: DeckId;
  vinylMode: boolean;
  /** pause/play ramp the platter down and up like a turntable motor (VirtualDJ-style) */
  vinylBrake: boolean;
  /** seconds the platter takes to stop; starting up takes 60% of it */
  brakeSec: number;
  waveformZoom: number; // seconds visible in the scrolling waveform
  setLayout: (l: Layout) => void;
  setLibraryHeight: (h: number) => void;
  setLibraryOpen: (b: boolean) => void;
  toggleFx: (id: DeckId) => void;
  toggleStems: (id: DeckId) => void;
  setPadMode: (id: DeckId, m: PadMode) => void;
  setSamplerOpen: (b: boolean) => void;
  setSettingsOpen: (b: boolean) => void;
  setKeyboardHelpOpen: (b: boolean) => void;
  setFocusedDeck: (id: DeckId) => void;
  setVinylMode: (b: boolean) => void;
  setVinylBrake: (b: boolean) => void;
  setBrakeSec: (s: number) => void;
  setWaveformZoom: (z: number) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      layout: 2,
      libraryHeight: 300,
      libraryOpen: true,
      fxOpen: { A: false, B: false, C: false, D: false },
      stemsOpen: { A: false, B: false, C: false, D: false },
      padMode: { A: 'hotcue', B: 'hotcue', C: 'hotcue', D: 'hotcue' },
      samplerOpen: false,
      settingsOpen: false,
      keyboardHelpOpen: false,
      focusedDeck: 'A',
      vinylMode: true,
      vinylBrake: true,
      brakeSec: 0.6,
      waveformZoom: 8,
      setLayout: (layout) => set({ layout }),
      setLibraryHeight: (libraryHeight) => set({ libraryHeight: Math.max(160, Math.min(700, libraryHeight)) }),
      setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
      toggleFx: (id) => set((s) => ({ fxOpen: { ...s.fxOpen, [id]: !s.fxOpen[id] }, stemsOpen: { ...s.stemsOpen, [id]: false } })),
      setPadMode: (id, m) => set((s) => ({ padMode: { ...s.padMode, [id]: m } })),
      toggleStems: (id) => set((s) => ({ stemsOpen: { ...s.stemsOpen, [id]: !s.stemsOpen[id] }, fxOpen: { ...s.fxOpen, [id]: false } })),
      setSamplerOpen: (samplerOpen) => set({ samplerOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setKeyboardHelpOpen: (keyboardHelpOpen) => set({ keyboardHelpOpen }),
      setFocusedDeck: (focusedDeck) => set({ focusedDeck }),
      setVinylMode: (vinylMode) => set({ vinylMode }),
      setVinylBrake: (vinylBrake) => set({ vinylBrake }),
      setBrakeSec: (brakeSec) => set({ brakeSec: Math.max(0.05, Math.min(3, brakeSec)) }),
      setWaveformZoom: (z) => set({ waveformZoom: Math.max(2, Math.min(40, z)) }),
    }),
    { name: 'djkado.ui', partialize: (s) => ({ layout: s.layout, padMode: s.padMode, libraryHeight: s.libraryHeight, libraryOpen: s.libraryOpen, vinylMode: s.vinylMode, vinylBrake: s.vinylBrake, brakeSec: s.brakeSec, waveformZoom: s.waveformZoom, samplerOpen: s.samplerOpen }) },
  ),
);
