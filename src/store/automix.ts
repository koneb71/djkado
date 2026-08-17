import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeckId } from '@/audio/engine/types';

export type AutomixPhase = 'off' | 'idle' | 'loading' | 'ready' | 'mixing' | 'empty';

interface AutomixState {
  enabled: boolean;
  /** length of the crossfade in bars (of the outgoing track) */
  mixBars: 4 | 8 | 16 | 32;
  /** tempo-match + beat-align the incoming track */
  beatmatch: boolean;
  /** swap the bass (low EQ) between decks during the mix */
  bassSwap: boolean;
  /** start the incoming track at its saved cue point (else the first beat) */
  startAtCue: boolean;
  phase: AutomixPhase;
  liveDeck: DeckId | null;
  nextDeck: DeckId | null;
  /** 0..1 while mixing */
  progress: number;
  /** seconds until the next transition starts (while 'ready') */
  countdown: number | null;
  setEnabled: (b: boolean) => void;
  setMixBars: (b: AutomixState['mixBars']) => void;
  setBeatmatch: (b: boolean) => void;
  setBassSwap: (b: boolean) => void;
  setStartAtCue: (b: boolean) => void;
  _status: (p: Partial<Pick<AutomixState, 'phase' | 'liveDeck' | 'nextDeck' | 'progress' | 'countdown'>>) => void;
}

export const useAutomix = create<AutomixState>()(
  persist(
    (set) => ({
      enabled: false,
      mixBars: 8,
      beatmatch: true,
      bassSwap: true,
      startAtCue: true,
      phase: 'off',
      liveDeck: null,
      nextDeck: null,
      progress: 0,
      countdown: null,
      setEnabled: (enabled) => set({ enabled }),
      setMixBars: (mixBars) => set({ mixBars }),
      setBeatmatch: (beatmatch) => set({ beatmatch }),
      setBassSwap: (bassSwap) => set({ bassSwap }),
      setStartAtCue: (startAtCue) => set({ startAtCue }),
      _status: (p) => set(p),
    }),
    { name: 'djkado.automix', partialize: (s) => ({ mixBars: s.mixBars, beatmatch: s.beatmatch, bassSwap: s.bassSwap, startAtCue: s.startAtCue }) },
  ),
);
