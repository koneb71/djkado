// Sandboxed preload (built as CommonJS `preload.cjs`). Only `electron` (contextBridge/ipcRenderer) is available here.
import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopBridge {
  isDesktop: true;
  platform: NodeJS.Platform;
  version(): Promise<string>;
  paths(): Promise<{ userData: string; logs: string }>;
  openDataFolder(): Promise<void>;
  openExternal(url: string): Promise<void>;
  getConfig(): Promise<any>;
  setConfig(patch: any): Promise<any>;
  pickAppleKey(): Promise<{ path: string } | null>;
  appleConfigured(): Promise<boolean>;
  setPlaying(on: boolean): void;
  updateStatus(): Promise<any>;
  checkForUpdates(): Promise<any>;
  installUpdate(): Promise<void>;
  onUpdateStatus(cb: (s: any) => void): () => void;
}

const bridge: DesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  version: () => ipcRenderer.invoke('app:version'),
  paths: () => ipcRenderer.invoke('app:paths'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  pickAppleKey: () => ipcRenderer.invoke('apple:pickKey'),
  appleConfigured: () => ipcRenderer.invoke('apple:configured'),
  setPlaying: (on) => ipcRenderer.send('power:playing', on),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => {
    const h = (_: unknown, s: any) => cb(s);
    ipcRenderer.on('update:status', h);
    return () => ipcRenderer.off('update:status', h);
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
