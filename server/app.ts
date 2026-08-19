/**
 * DJKado API (Hono). Shared by the standalone dev server (server/index.ts) and the Electron main process.
 *   GET /api/health
 *   GET|HEAD /api/apple/developer-token  → { token, expiresAt } (501 until Apple credentials are configured)
 *   GET /api/apple/preview?u=…           → CORS-friendly proxy for Apple preview audio (allow-listed hosts)
 * With `staticDir` it also serves the built renderer with an SPA fallback (used by the desktop app).
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { appleConfigFromEnv, appleConfigured, mintDeveloperToken, type AppleConfig } from './appleToken.ts';

export interface CreateAppOptions {
  /** Absolute path to the built renderer (dist/). When set, static files + SPA fallback are served. */
  staticDir?: string;
  corsOrigins?: string[];
  /** Explicit Apple credentials (desktop settings). Falls back to process.env when omitted. */
  apple?: () => AppleConfig | null;
}

const ALLOWED_HOSTS = [/\.mzstatic\.com$/, /^audio-ssl\.itunes\.apple\.com$/, /\.apple\.com$/];

export function createApp(opts: CreateAppOptions = {}) {
  const app = new Hono();
  const getApple = opts.apple ?? appleConfigFromEnv;
  const origins = opts.corsOrigins ?? ['http://127.0.0.1:5173', 'http://localhost:5173'];

  app.use('/api/*', cors({ origin: origins }));

  app.get('/api/health', (c) => c.json({ ok: true, apple: appleConfigured(getApple()) }));

  app.on(['GET', 'HEAD'], '/api/apple/developer-token', async (c) => {
    const cfg = getApple();
    if (!appleConfigured(cfg)) return c.json({ error: 'Apple Music not configured. Set APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH (or configure it in Settings ▸ Desktop).' }, 501);
    try {
      return c.json(await mintDeveloperToken(cfg));
    } catch (e: any) {
      return c.json({ error: e?.message ?? 'Failed to mint token' }, 500);
    }
  });

  app.get('/api/apple/preview', async (c) => {
    const u = c.req.query('u');
    if (!u) return c.text('missing u', 400);
    let url: URL;
    try {
      url = new URL(u);
    } catch {
      return c.text('bad url', 400);
    }
    if (!ALLOWED_HOSTS.some((re) => re.test(url.hostname))) return c.text('host not allowed', 403);
    const upstream = await fetch(url);
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'audio/mp4', 'Cache-Control': 'public, max-age=86400' } });
  });

  if (opts.staticDir) {
    const root = opts.staticDir;
    // static assets: gzip text, long cache for hashed /assets, no-cache for the HTML shell
    app.use('*', compress());
    app.use('*', async (c, next) => {
      await next();
      if (c.req.path.startsWith('/assets/') || c.req.path.startsWith('/vendor/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
      else if (c.res.headers.get('content-type')?.includes('text/html')) c.header('Cache-Control', 'no-cache');
    });
    app.use('*', serveStatic({ root }));
    // SPA fallback (e.g. /callback/spotify)
    app.get('*', serveStatic({ root, path: 'index.html' }));
  }

  return app;
}

/** Tiny .env loader (no dependency). Existing process.env values win. */
export function loadEnvFile(path: string, read: (p: string) => string) {
  try {
    for (const line of read(path).split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return true;
  } catch {
    return false;
  }
}
