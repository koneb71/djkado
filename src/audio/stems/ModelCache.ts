import type { StemModel } from './models';

const CACHE = 'djkado-stem-models-v1';

export type DownloadProgress = (loaded: number, total: number) => void;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Cache Storage-backed model store with download progress + sha256 verification. Works in workers. */
export const ModelCache = {
  async has(m: StemModel): Promise<boolean> {
    try {
      const c = await caches.open(CACHE);
      return !!(await c.match(m.url));
    } catch {
      return false;
    }
  },

  /** Returns the model bytes, downloading + verifying on first use. */
  async get(m: StemModel, onProgress?: DownloadProgress, signal?: AbortSignal): Promise<ArrayBuffer> {
    let cache: Cache | null = null;
    try {
      cache = await caches.open(CACHE);
      const hit = await cache.match(m.url);
      if (hit) {
        onProgress?.(m.bytes, m.bytes);
        return await hit.arrayBuffer();
      }
    } catch {
      cache = null;
    }
    const res = await fetch(m.url, { signal, mode: 'cors' });
    if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
    const total = Number(res.headers.get('Content-Length') || res.headers.get('X-Linked-Size') || m.bytes);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
    const buf = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) {
      buf.set(c, o);
      o += c.length;
    }
    if (m.sha256) {
      const hex = await sha256Hex(buf.buffer);
      if (hex !== m.sha256) throw new Error(`Model checksum mismatch (${hex.slice(0, 12)}… ≠ ${m.sha256.slice(0, 12)}…)`);
    }
    if (cache) {
      try {
        await cache.put(m.url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(loaded) } }));
      } catch (e) {
        console.warn('model cache put failed', e);
      }
    }
    return buf.buffer;
  },

  async delete(m: StemModel) {
    try {
      const c = await caches.open(CACHE);
      await c.delete(m.url);
    } catch {
      /* noop */
    }
  },

  async clear() {
    try {
      await caches.delete(CACHE);
    } catch {
      /* noop */
    }
  },
};
