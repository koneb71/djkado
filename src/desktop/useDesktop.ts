import { useEffect } from 'react';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { useDecks } from '@/store/decks';
import { useRecorder } from '@/audio/engine/Recorder';
import { desktop } from './bridge';
import { installDesktopActions } from './actions';

/** Desktop-only glue: menu actions, autoplay unlock, power-save blocker while playing/recording. */
export function useDesktop() {
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    installDesktopActions();
    document.documentElement.classList.add('desktop', `platform-${d.platform}`);
    // Electron allows autoplay → power the engine on immediately (no unlock overlay)
    void AudioEngine.ensureRunning();
    let last: boolean | null = null;
    const push = () => {
      const playing = Object.values(useDecks.getState().decks).some((x) => x.playing) || useRecorder.getState().recording;
      if (playing !== last) {
        last = playing;
        d.setPlaying(playing);
      }
    };
    const u1 = useDecks.subscribe(push);
    const u2 = useRecorder.subscribe(push);
    push();
    return () => {
      u1();
      u2();
      d.setPlaying(false);
    };
  }, []);
}
