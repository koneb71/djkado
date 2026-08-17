import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AnalysisResult, HotCue } from '@/audio/engine/types';
import type { TrackMeta } from '@/services/tracks/TrackRef';

export interface StoredTrack {
  id: string; // trackKey
  meta: TrackMeta;
  source: 'local' | 'demo';
  fileName: string;
  size: number;
  lastModified: number;
  handleId?: string; // reference into handles store when from FS Access dir
  relativePath?: string;
}

export interface StoredCues {
  trackId: string;
  hotCues: (HotCue | null)[];
  cuePoint: number;
  gridOverride?: { bpm: number; firstBeatSec: number } | null;
}

interface DJKadoDB extends DBSchema {
  analysis: { key: string; value: AnalysisResult & { id: string; version: number } };
  tracks: { key: string; value: StoredTrack; indexes: { bySource: string } };
  cues: { key: string; value: StoredCues };
  handles: { key: string; value: { id: string; name: string; handle: FileSystemDirectoryHandle; addedAt: number } };
  history: { key: number; value: { id?: number; trackId: string; meta: TrackMeta; playedAt: number; deck: string } };
  samples: { key: string; value: { id: string; name: string; blob: Blob; bank: number; pad: number; mode: string; color: string } };
  stems: { key: string; value: StoredStems; indexes: { byUsed: number } };
}

export interface StoredStems {
  id: string; // trackId
  modelId: string;
  engine: string;
  sampleRate: number;
  length: number;
  scales: number[];
  /** per stem (vocals, drums, bass, other) → per channel [L, R] → Int16 blob parts */
  parts: Blob[][][];
  bytes: number;
  createdAt: number;
  usedAt: number;
}

export const ANALYSIS_VERSION = 5;
let dbPromise: Promise<IDBPDatabase<DJKadoDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DJKadoDB>('djkado', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('analysis', { keyPath: 'id' });
          const t = db.createObjectStore('tracks', { keyPath: 'id' });
          t.createIndex('bySource', 'source');
          db.createObjectStore('cues', { keyPath: 'trackId' });
          db.createObjectStore('handles', { keyPath: 'id' });
          db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        }
        if (oldVersion < 2) {
          db.createObjectStore('samples', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          const st = db.createObjectStore('stems', { keyPath: 'id' });
          st.createIndex('byUsed', 'usedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedAnalysis(id: string): Promise<AnalysisResult | null> {
  try {
    const db = await getDb();
    const rec = await db.get('analysis', id);
    if (!rec || rec.version !== ANALYSIS_VERSION) return null;
    return rec;
  } catch {
    return null;
  }
}

export async function putCachedAnalysis(id: string, a: AnalysisResult) {
  try {
    const db = await getDb();
    await db.put('analysis', { ...a, id, version: ANALYSIS_VERSION });
  } catch {
    /* ignore quota errors */
  }
}

export async function getCues(trackId: string): Promise<StoredCues | undefined> {
  try {
    return await (await getDb()).get('cues', trackId);
  } catch {
    return undefined;
  }
}

export async function putCues(c: StoredCues) {
  try {
    await (await getDb()).put('cues', c);
  } catch {
    /* ignore */
  }
}

export async function addHistory(entry: { trackId: string; meta: TrackMeta; deck: string }) {
  try {
    await (await getDb()).add('history', { ...entry, playedAt: Date.now() });
  } catch {
    /* ignore */
  }
}

export async function getHistory(limit = 200) {
  try {
    const all = await (await getDb()).getAll('history');
    return all.sort((a, b) => b.playedAt - a.playedAt).slice(0, limit);
  } catch {
    return [];
  }
}

/* ------------------------------- stems cache ------------------------------- */
export const STEMS_CACHE_MAX_TRACKS = 40;

export async function getStoredStems(trackId: string): Promise<StoredStems | undefined> {
  try {
    const db = await getDb();
    const rec = await db.get('stems', trackId);
    if (rec) {
      rec.usedAt = Date.now();
      await db.put('stems', rec);
    }
    return rec;
  } catch {
    return undefined;
  }
}

export async function hasStoredStems(trackId: string): Promise<boolean> {
  try {
    const db = await getDb();
    return (await db.getKey('stems', trackId)) !== undefined;
  } catch {
    return false;
  }
}

export async function putStoredStems(rec: StoredStems) {
  const db = await getDb();
  await db.put('stems', rec);
  // LRU eviction
  const keys = await db.getAllKeysFromIndex('stems', 'byUsed');
  if (keys.length > STEMS_CACHE_MAX_TRACKS) {
    for (const k of keys.slice(0, keys.length - STEMS_CACHE_MAX_TRACKS)) await db.delete('stems', k);
  }
}

export async function deleteStoredStems(trackId: string) {
  try {
    await (await getDb()).delete('stems', trackId);
  } catch {
    /* noop */
  }
}

export async function stemsCacheStats(): Promise<{ tracks: number; bytes: number }> {
  try {
    const all = await (await getDb()).getAll('stems');
    return { tracks: all.length, bytes: all.reduce((a, r) => a + (r.bytes || 0), 0) };
  } catch {
    return { tracks: 0, bytes: 0 };
  }
}

export async function clearStemsCache() {
  try {
    await (await getDb()).clear('stems');
  } catch {
    /* noop */
  }
}
