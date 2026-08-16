import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { TopBar } from './TopBar';
import { DeckArea } from './DeckArea';
import { BottomPanel } from './BottomPanel';
import { AudioUnlockOverlay } from '../overlays/AudioUnlockOverlay';
import { DropZone } from '../overlays/DropZone';
import { useAudioUnlocked, useEngineTick } from '@/hooks/useEngine';
import { useKeyboardShortcuts } from '@/audio/keyboard/shortcuts';
import { SettingsDialog } from '../settings/SettingsDialog';
import { KeyboardHelp } from '../settings/KeyboardHelp';
import { SamplerPanel } from '../sampler/SamplerPanel';
import { useMidi } from '@/audio/midi/MidiManager';
import { useUi } from '@/store/ui';
import { useDesktop } from '@/desktop/useDesktop';

export function AppShell() {
  const unlocked = useAudioUnlocked();
  useEngineTick(unlocked);
  useKeyboardShortcuts();
  useMidi();
  useDesktop();
  const samplerOpen = useUi((s) => s.samplerOpen);

  useEffect(() => {
    document.title = 'DJKado';
  }, []);

  return (
    <DropZone>
      <div className="relative flex h-full min-w-[1180px] flex-col bg-bg text-text overflow-hidden">
        <TopBar />
        <div className="flex min-h-0 flex-1 flex-col">
          <DeckArea />
          {samplerOpen && <SamplerPanel />}
          <BottomPanel />
        </div>
        {!unlocked && <AudioUnlockOverlay />}
        <SettingsDialog />
        <KeyboardHelp />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{ style: { background: 'var(--color-panel-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' } }}
        />
      </div>
    </DropZone>
  );
}
