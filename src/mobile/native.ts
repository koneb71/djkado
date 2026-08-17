import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { useDecks } from '@/store/decks';
import { useRecorder } from '@/audio/engine/Recorder';
import { useUi } from '@/store/ui';
import { useMobileUi } from './store';

/** Light haptic tick for pads/buttons on native. No-op on the web. */
export function tap() {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Capacitor glue: status bar, splash, keep-awake while playing, Android back button. */
export function useNativeApp() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add('native', `platform-${Capacitor.getPlatform()}`);
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#0b0d10' }).catch(() => {});
    SplashScreen.hide().catch(() => {});

    let awake = false;
    const sync = () => {
      const playing = Object.values(useDecks.getState().decks).some((d) => d.playing) || useRecorder.getState().recording;
      if (playing === awake) return;
      awake = playing;
      (playing ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
    };
    const u1 = useDecks.subscribe(sync);
    const u2 = useRecorder.subscribe(sync);

    const backSub = CapApp.addListener('backButton', () => {
      const ui = useUi.getState();
      const m = useMobileUi.getState();
      if (ui.settingsOpen) return ui.setSettingsOpen(false);
      if (ui.keyboardHelpOpen) return ui.setKeyboardHelpOpen(false);
      if (m.tab !== 'decks') return m.setTab('decks');
      CapApp.minimizeApp().catch(() => {});
    });
    return () => {
      u1();
      u2();
      backSub.then((h) => h.remove()).catch(() => {});
    };
  }, []);
}
