import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, session, shell } from 'electron';
import path from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { createApp } from '../server/app';
import { appleConfigured } from '../server/appleToken';
import { appleConfig, importAppleKey, loadConfig, loadDesktopEnv, saveConfig, userData } from './config';
import { buildMenu } from './menu';
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate } from './updater';
import { loadWindowState, trackWindowState } from './window-state';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const PROD_PORT = 47831;
const DEV_API_PORT = 8787;

/* ------------------------------ single instance ----------------------------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/* --------------------------- chromium switches ---------------------------- */
// OS media keys must not hijack a live set; keep timers alive when hidden.
app.commandLine.appendSwitch('disable-features', ['HardwareMediaKeyHandling', 'MediaSessionService', ...(process.platform === 'win32' ? ['CalculateNativeWinOcclusion'] : [])].join(','));
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
{
  // must read config before `ready` for the audio buffer switch → cheap sync read
  try {
    const cfg = loadConfig();
    if (cfg.audioBufferSize && cfg.audioBufferSize >= 64) app.commandLine.appendSwitch('audio-buffer-size', String(cfg.audioBufferSize));
  } catch {
    /* ignore */
  }
}

let server: ServerType | null = null;
let mainWindow: BrowserWindow | null = null;
let appOrigin = '';
let psbId: number | null = null;

const ALLOWED_PERMISSIONS = new Set(['midi', 'midiSysex', 'media', 'speaker-selection', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'fileSystem', 'notifications', 'pointerLock']);
const AUTH_HOSTS = ['accounts.spotify.com', 'authorize.music.apple.com', 'idmsa.apple.com', 'appleid.apple.com', 'js-cdn.music.apple.com'];

function isAppOrigin(url: string) {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}
function isAllowedNav(url: string) {
  try {
    const u = new URL(url);
    return u.origin === appOrigin || AUTH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/* --------------------------------- server --------------------------------- */
function startServer(): Promise<string> {
  const isDev = !!DEV_URL;
  const port = isDev ? DEV_API_PORT : PROD_PORT;
  const origin = isDev ? new URL(DEV_URL!).origin : `http://127.0.0.1:${port}`;
  const staticDir = isDev ? undefined : path.join(app.getAppPath(), 'dist');
  const honoApp = createApp({ staticDir, corsOrigins: [origin, 'http://127.0.0.1:5173', 'http://localhost:5173'], apple: appleConfig });
  return new Promise((resolve, reject) => {
    server = serve({ fetch: honoApp.fetch, port, hostname: '127.0.0.1' }, () => resolve(isDev ? DEV_URL! : origin));
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        dialog.showErrorBox('DJKado cannot start', `Port ${port} on 127.0.0.1 is already in use (is another DJKado or a dev server running?). Free the port and relaunch.`);
      } else dialog.showErrorBox('DJKado server error', e.message);
      reject(e);
    });
  });
}

/* --------------------------------- window --------------------------------- */
function createWindow(url: string) {
  const state = loadWindowState();
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'DJKado',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 18 },
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  mainWindow = win;
  if (state.maximized) win.maximize();
  trackWindowState(win);

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    // MusicKit authorization popup must open in-app; everything else goes to the system browser
    if (AUTH_HOSTS.some((h) => target.includes(h))) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    void shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, target) => {
    if (!isAllowedNav(target)) {
      e.preventDefault();
      void shell.openExternal(target);
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });
  void win.loadURL(url);
  buildMenu(win);
  initUpdater(win);
  return win;
}

/* ----------------------------------- ipc ---------------------------------- */
function registerIpc() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:paths', () => ({ userData: userData(), logs: app.getPath('logs') }));
  ipcMain.handle('app:openDataFolder', () => shell.openPath(userData()).then(() => undefined));
  ipcMain.handle('shell:openExternal', (_e, url: string) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : Promise.resolve()));
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:set', (_e, patch) => saveConfig(patch));
  ipcMain.handle('apple:configured', () => appleConfigured(appleConfig()));
  ipcMain.handle('apple:pickKey', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { title: 'Choose your MusicKit private key (.p8)', properties: ['openFile'], filters: [{ name: 'MusicKit key', extensions: ['p8'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: importAppleKey(r.filePaths[0]) };
  });
  ipcMain.on('power:playing', (_e, on: boolean) => {
    if (on && psbId === null) psbId = powerSaveBlocker.start('prevent-app-suspension');
    else if (!on && psbId !== null) {
      powerSaveBlocker.stop(psbId);
      psbId = null;
    }
  });
  ipcMain.handle('update:status', () => getUpdateStatus());
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:install', () => installUpdate());
}

/* ------------------------------- permissions ------------------------------ */
function installPermissionHandlers() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(wc.getURL())));
  ses.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED_PERMISSIONS.has(permission) && (origin === appOrigin || origin.startsWith(appOrigin)));
}

/* -------------------------------- lifecycle ------------------------------- */
app.whenReady().then(async () => {
  loadDesktopEnv();
  app.setAboutPanelOptions({ applicationName: 'DJKado', applicationVersion: app.getVersion(), copyright: '© DJKado', website: 'https://github.com/koneb71/djkado' });
  registerIpc();
  let url: string;
  try {
    url = await startServer();
  } catch {
    app.quit();
    return;
  }
  appOrigin = new URL(url).origin;
  installPermissionHandlers();
  createWindow(url);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  server?.close();
});
