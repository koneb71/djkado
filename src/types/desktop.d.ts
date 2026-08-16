import type { DesktopBridge } from '../../electron/preload';

declare global {
  interface Window {
    desktop?: DesktopBridge;
    djkadoActions?: Record<string, () => void>;
  }
}
export {};
