/**
 * Standalone DJKado server.
 *   dev:        `node server/index.ts` (Node ≥ 22.6, native TS) — API only on 127.0.0.1:8787, Vite proxies /api
 *   production: STATIC_DIR=/app/dist HOST=0.0.0.0 PORT=51732 node dist-server/index.mjs — serves the built app + API
 *               (see Dockerfile; Dokploy / any container host)
 * The Electron desktop app embeds the same Hono app (see server/app.ts) instead of running this.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp, loadEnvFile } from './app.ts';
import { appleConfigured } from './appleToken.ts';

loadEnvFile('.env', (p) => readFileSync(p, 'utf8'));

const port = Number(process.env.PORT || 8787);
const staticDir = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : undefined;
const hostname = process.env.HOST || (staticDir ? '0.0.0.0' : '127.0.0.1');
if (staticDir && !existsSync(staticDir)) console.warn(`[djkado] STATIC_DIR ${staticDir} does not exist — run \`pnpm build\` first`);
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);

serve({ fetch: createApp({ staticDir, corsOrigins }).fetch, port, hostname });
console.log(`[djkado] http://${hostname}:${port}  static=${staticDir ?? 'off (API only)'}  apple=${appleConfigured() ? 'configured' : 'not configured (mock mode)'}`);
