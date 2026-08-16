import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from '../server/app';
import type { AppleConfig } from '../server/appleToken';

export interface DesktopConfig {
  apple: { teamId: string; keyId: string; keyPath: string };
  audioBufferSize?: number; // optional Chromium --audio-buffer-size (frames)
}

const DEFAULTS: DesktopConfig = { apple: { teamId: '', keyId: '', keyPath: '' } };

export const userData = () => app.getPath('userData');
const configPath = () => path.join(userData(), 'config.json');

let cache: DesktopConfig | null = null;

export function loadConfig(): DesktopConfig {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(configPath(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function saveConfig(patch: Partial<DesktopConfig>): DesktopConfig {
  const next = { ...loadConfig(), ...patch, apple: { ...loadConfig().apple, ...(patch.apple ?? {}) } };
  mkdirSync(userData(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(next, null, 2));
  cache = next;
  return next;
}

/** Load userData/.env (packaged) or the project .env (dev) into process.env. */
export function loadDesktopEnv() {
  const read = (p: string) => readFileSync(p, 'utf8');
  if (!app.isPackaged) loadEnvFile(path.join(process.cwd(), '.env'), read);
  loadEnvFile(path.join(userData(), '.env'), read);
}

/** Apple credentials: Settings (config.json) first, then env. Relative key paths resolve against userData. */
export function appleConfig(): AppleConfig | null {
  const c = loadConfig().apple;
  const fromCfg = c.teamId && c.keyId && c.keyPath ? c : null;
  const teamId = fromCfg?.teamId || process.env.APPLE_TEAM_ID;
  const keyId = fromCfg?.keyId || process.env.APPLE_KEY_ID;
  let keyPath = fromCfg?.keyPath || process.env.APPLE_PRIVATE_KEY_PATH;
  if (!teamId || !keyId || !keyPath) return null;
  if (!path.isAbsolute(keyPath)) keyPath = path.join(userData(), keyPath);
  return existsSync(keyPath) ? { teamId, keyId, keyPath } : null;
}

/** Copy a picked .p8 into userData and remember it. */
export function importAppleKey(srcPath: string): string {
  mkdirSync(userData(), { recursive: true });
  const dest = path.join(userData(), 'AuthKey.p8');
  copyFileSync(srcPath, dest);
  saveConfig({ apple: { ...loadConfig().apple, keyPath: dest } });
  return dest;
}
