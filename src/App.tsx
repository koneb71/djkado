import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { MobileShell } from './components/mobile/MobileShell';
import { useIsMobile } from './mobile/useIsMobile';
import { useAudioUnlocked } from './hooks/useEngine';
import { restoreEngineState, restoreSession } from './services/session';

export default function App() {
  const mobile = useIsMobile();
  const unlocked = useAudioUnlocked();

  // library + settings come back immediately; FX and deck switches need an AudioContext,
  // which only exists after the first user gesture
  useEffect(() => {
    void restoreSession();
  }, []);
  useEffect(() => {
    if (unlocked) restoreEngineState();
  }, [unlocked]);

  return mobile ? <MobileShell /> : <AppShell />;
}
