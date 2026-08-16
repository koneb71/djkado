import { app, BrowserWindow, shell } from 'electron';
import updater from 'electron-updater';

const { autoUpdater } = updater;

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; reason: string; releasesUrl: string }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

export const RELEASES_URL = 'https://github.com/koneb71/djkado/releases';

let status: UpdateStatus = { state: 'idle' };
let win: BrowserWindow | null = null;
let installed = false;

function set(s: UpdateStatus) {
  status = s;
  win?.webContents.send('update:status', s);
}

export const getUpdateStatus = () => status;

/** Auto-update is only meaningful in packaged builds; macOS additionally requires a code-signed app. */
export function updatesSupported(): { ok: boolean; reason?: string } {
  if (!app.isPackaged) return { ok: false, reason: 'Development build — updates are only checked in packaged apps.' };
  if (process.platform === 'darwin' && process.env.DJKADO_SIGNED !== '1' && !process.env.CSC_LINK) {
    return { ok: false, reason: 'This macOS build is unsigned; auto-update needs a signed build. Download new versions from GitHub Releases.' };
  }
  return { ok: true };
}

export function initUpdater(window: BrowserWindow) {
  win = window;
  const sup = updatesSupported();
  if (!sup.ok) {
    set({ state: 'unsupported', reason: sup.reason!, releasesUrl: RELEASES_URL });
    return;
  }
  if (installed) return;
  installed = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => set({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', (i) => set({ state: 'not-available', version: i.version }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'downloaded', version: i.version }));
  autoUpdater.on('error', (e) => set({ state: 'error', message: e?.message ?? String(e) }));
  setTimeout(() => void checkForUpdates(), 5000);
}

export async function checkForUpdates() {
  const sup = updatesSupported();
  if (!sup.ok) {
    set({ state: 'unsupported', reason: sup.reason!, releasesUrl: RELEASES_URL });
    return status;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (e: any) {
    set({ state: 'error', message: e?.message ?? String(e) });
  }
  return status;
}

export function installUpdate() {
  if (status.state === 'downloaded') autoUpdater.quitAndInstall();
  else void shell.openExternal(RELEASES_URL);
}
