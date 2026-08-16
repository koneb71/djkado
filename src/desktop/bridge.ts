import type { DesktopBridge } from '../../electron/preload';

/** The Electron preload bridge, or null when running in a normal browser. */
export const desktop = (): DesktopBridge | null => (typeof window !== 'undefined' && window.desktop ? window.desktop : null);
export const isDesktop = () => !!desktop();
export const isMacDesktop = () => desktop()?.platform === 'darwin';

let widevine: Promise<boolean> | null = null;
/** Stock Electron ships no Widevine CDM → DRM streaming (Spotify SDK / Apple full tracks) can't play there. */
export function hasWidevine(): Promise<boolean> {
  if (!widevine) {
    widevine = (async () => {
      try {
        if (!navigator.requestMediaKeySystemAccess) return false;
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return widevine;
}
