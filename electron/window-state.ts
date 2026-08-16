import { app, BrowserWindow, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const file = () => path.join(app.getPath('userData'), 'window-state.json');
const DEFAULT: WindowState = { width: 1440, height: 900, maximized: false };

export function loadWindowState(): WindowState {
  try {
    const s = { ...DEFAULT, ...JSON.parse(readFileSync(file(), 'utf8')) } as WindowState;
    // make sure the window is on a visible display
    if (s.x !== undefined && s.y !== undefined) {
      const onScreen = screen.getAllDisplays().some((d) => s.x! >= d.bounds.x - 50 && s.y! >= d.bounds.y - 50 && s.x! < d.bounds.x + d.bounds.width && s.y! < d.bounds.y + d.bounds.height);
      if (!onScreen) {
        delete s.x;
        delete s.y;
      }
    }
    return s;
  } catch {
    return { ...DEFAULT };
  }
}

export function trackWindowState(win: BrowserWindow) {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    const s: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
    try {
      writeFileSync(file(), JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 300);
  };
  win.on('resize', debounced);
  win.on('move', debounced);
  win.on('maximize', debounced);
  win.on('unmaximize', debounced);
  win.on('close', save);
}
