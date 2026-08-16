import { performAction } from '@/audio/midi/actions';
import { LocalLibrary } from '@/services/localLibrary/LocalLibrary';
import { useLibrary } from '@/store/library';
import { useUi } from '@/store/ui';

/**
 * Actions the Electron menu invokes via `webContents.executeJavaScript('window.djkadoActions.<id>()', true)`.
 * Running them from executeJavaScript with userGesture=true gives showOpenFilePicker() the activation it needs.
 */
export function installDesktopActions() {
  const ui = () => useUi.getState();
  window.djkadoActions = {
    openFiles: () => {
      useLibrary.getState().setSource('local');
      ui().setLibraryOpen(true);
      void LocalLibrary.pickFiles();
    },
    openFolder: () => {
      useLibrary.getState().setSource('local');
      ui().setLibraryOpen(true);
      void LocalLibrary.pickFolder();
    },
    record: () => performAction('record.toggle', 1),
    layout2: () => ui().setLayout(2),
    layout4: () => ui().setLayout(4),
    toggleSampler: () => performAction('ui.sampler', 1),
    toggleLibrary: () => performAction('ui.library', 1),
    settings: () => ui().setSettingsOpen(true),
    shortcuts: () => ui().setKeyboardHelpOpen(true),
  };
}
