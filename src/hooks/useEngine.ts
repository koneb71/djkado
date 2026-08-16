import { useEffect, useState } from 'react';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { addFrameCallback } from './useAnimationFrame';
import type { DeckId } from '@/audio/engine/types';

/** Whether the AudioContext has been unlocked by a user gesture. */
export function useAudioUnlocked() {
  const [ok, setOk] = useState(AudioEngine.isReady);
  useEffect(() => {
    if (ok) return;
    AudioEngine.onUnlock(() => setOk(true));
    const tryUnlock = () => {
      AudioEngine.ensureRunning().then((r) => r && setOk(true));
    };
    window.addEventListener('pointerdown', tryUnlock, { capture: true });
    window.addEventListener('keydown', tryUnlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', tryUnlock, { capture: true });
      window.removeEventListener('keydown', tryUnlock, { capture: true });
    };
  }, [ok]);
  return ok;
}

/** Runs the engine tick on the shared rAF loop while mounted. */
export function useEngineTick(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return addFrameCallback((now) => AudioEngine.tick(now));
  }, [enabled]);
}

export const useDeckEngine = (id: DeckId) => AudioEngine.deck(id);
