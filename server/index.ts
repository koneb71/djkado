/**
 * Standalone DJKado API server for web development: `node server/index.ts` (Node ≥ 22.6, native TS) or `bun server/index.ts`.
 * The Electron desktop app embeds the same Hono app (see server/app.ts) instead of running this.
 */
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp, loadEnvFile } from './app.ts';
import { appleConfigured } from './appleToken.ts';

loadEnvFile('.env', (p) => readFileSync(p, 'utf8'));

const port = Number(process.env.PORT || 8787);
serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' });
console.log(`[djkado api] http://127.0.0.1:${port}  apple=${appleConfigured() ? 'configured' : 'not configured (mock mode)'}`);
