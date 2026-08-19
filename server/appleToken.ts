import { readFile } from 'node:fs/promises';
import { SignJWT, importPKCS8 } from 'jose';

export interface AppleConfig {
  teamId: string;
  keyId: string;
  /** path to the .p8 private key … */
  keyPath?: string;
  /** … or the PEM contents inline (APPLE_PRIVATE_KEY, handy for container env vars) */
  key?: string;
}

let cached: { token: string; expiresAt: number; key: string } | null = null;

/** Apple config from explicit object or process.env (APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY_PATH or APPLE_PRIVATE_KEY). */
export function appleConfigFromEnv(): AppleConfig | null {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const keyPath = process.env.APPLE_PRIVATE_KEY_PATH;
  const key = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return teamId && keyId && (keyPath || key) ? { teamId, keyId, keyPath, key } : null;
}

export function appleConfigured(cfg: AppleConfig | null = appleConfigFromEnv()) {
  return !!(cfg && cfg.teamId && cfg.keyId && (cfg.keyPath || cfg.key));
}

/** Mint (and cache) a MusicKit developer token: ES256 JWT, iss = team id, kid = key id, ≤ 180 days. */
export async function mintDeveloperToken(cfg: AppleConfig | null = appleConfigFromEnv()): Promise<{ token: string; expiresAt: number }> {
  if (!cfg) throw new Error('Apple Music is not configured');
  const cacheKey = `${cfg.teamId}|${cfg.keyId}|${cfg.keyPath ?? ''}|${cfg.key ? cfg.key.length : 0}`;
  if (cached && cached.key === cacheKey && cached.expiresAt - Date.now() > 7 * 86_400_000) return cached;
  const pem = cfg.key ?? (await readFile(cfg.keyPath!, 'utf8'));
  const key = await importPKCS8(pem, 'ES256');
  const expiresAt = Date.now() + 179 * 86_400_000;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(key);
  cached = { token, expiresAt, key: cacheKey };
  return { token, expiresAt };
}
