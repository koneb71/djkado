import type { TrackRef } from '@/services/tracks/TrackRef';
import { useLibrary } from '@/store/library';
import { getDb } from './db';
import { isAudioFile, metaFromFilename, readTags, trackKeyForFile } from './tags';
import { getCachedAnalysis } from './db';

/**
 * Local file library: drag/drop, file picker, directory picker (File System Access API when
 * available, <input webkitdirectory> otherwise). Persists directory handles for re-scan.
 */
export const LocalLibrary = {
  /** Add File objects to the library; tags parsed in the background. */
  async addFiles(files: File[]): Promise<TrackRef[]> {
    const audio = files.filter(isAudioFile);
    if (!audio.length) return [];
    const lib = useLibrary.getState();
    const refs: TrackRef[] = audio.map((file) => {
      const g = metaFromFilename(file.name);
      return { kind: 'local', file, meta: { id: trackKeyForFile(file), title: g.title, artist: g.artist, addedAt: Date.now() } };
    });
    lib.addLocalTracks(refs);
    lib.setScanning({ active: true, done: 0, total: audio.length });
    // enrich sequentially in small batches to keep UI smooth
    let done = 0;
    const batch = 3;
    for (let i = 0; i < refs.length; i += batch) {
      await Promise.all(
        refs.slice(i, i + batch).map(async (r) => {
          if (r.kind !== 'local') return;
          const [tags, cached] = await Promise.all([readTags(r.file), getCachedAnalysis(r.meta.id)]);
          useLibrary.getState().updateLocalTrack(r.meta.id, {
            ...tags,
            bpm: cached?.bpm || tags.bpm,
            key: cached?.key.camelot || tags.key,
            durationSec: cached?.duration || tags.durationSec,
          });
          done++;
          useLibrary.getState().setScanning({ done });
        }),
      );
    }
    useLibrary.getState().setScanning({ active: false });
    return refs;
  },

  /** Open the OS file picker. */
  async pickFiles() {
    const w = window as any;
    if (w.showOpenFilePicker) {
      try {
        const handles: FileSystemFileHandle[] = await w.showOpenFilePicker({
          multiple: true,
          types: [{ description: 'Audio', accept: { 'audio/*': ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.aif', '.aiff'] } }],
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        return this.addFiles(files);
      } catch (e: any) {
        if (e?.name === 'AbortError') return [];
        // fall through to input
      }
    }
    return new Promise<TrackRef[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.aif,.aiff';
      input.onchange = async () => resolve(await this.addFiles(Array.from(input.files ?? [])));
      input.click();
    });
  },

  /** Open a folder (recursively). Persists the handle when the FS Access API is available. */
  async pickFolder() {
    const w = window as any;
    if (w.showDirectoryPicker) {
      try {
        const dir: FileSystemDirectoryHandle = await w.showDirectoryPicker({ mode: 'read' });
        try {
          const db = await getDb();
          await db.put('handles', { id: dir.name, name: dir.name, handle: dir, addedAt: Date.now() });
        } catch {
          /* handles may not be storable */
        }
        return this.scanDirectory(dir);
      } catch (e: any) {
        if (e?.name === 'AbortError') return [];
      }
    }
    return new Promise<TrackRef[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      (input as any).webkitdirectory = true;
      input.onchange = async () => resolve(await this.addFiles(Array.from(input.files ?? [])));
      input.click();
    });
  },

  async scanDirectory(dir: FileSystemDirectoryHandle): Promise<TrackRef[]> {
    const files: File[] = [];
    const walk = async (d: FileSystemDirectoryHandle, depth: number) => {
      if (depth > 6) return;
      for await (const [, h] of (d as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        if (h.kind === 'file') {
          const f = await (h as FileSystemFileHandle).getFile();
          if (isAudioFile(f)) files.push(f);
        } else if (h.kind === 'directory') await walk(h as FileSystemDirectoryHandle, depth + 1);
      }
    };
    await walk(dir, 0);
    return this.addFiles(files);
  },

  /** Re-open previously granted folders (requires a user gesture for permission prompt). */
  async restoreFolders(): Promise<number> {
    try {
      const db = await getDb();
      const all = await db.getAll('handles');
      let n = 0;
      for (const rec of all) {
        const h: any = rec.handle;
        const perm = await h.queryPermission?.({ mode: 'read' });
        if (perm === 'granted' || (await h.requestPermission?.({ mode: 'read' })) === 'granted') {
          await this.scanDirectory(rec.handle);
          n++;
        }
      }
      return n;
    } catch {
      return 0;
    }
  },

  async savedFolders() {
    try {
      const db = await getDb();
      return db.getAll('handles');
    } catch {
      return [];
    }
  },

  async forgetFolder(id: string) {
    try {
      const db = await getDb();
      await db.delete('handles', id);
    } catch {
      /* noop */
    }
  },
};
