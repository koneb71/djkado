import { toast } from 'sonner';
import type { TrackMeta, TrackRef } from '@/services/tracks/TrackRef';
import { useLibrary } from '@/store/library';
import { getDb, getStoredTrack, getStoredTracks, putStoredTracks, deleteStoredTracks, type StoredTrack } from './db';
import { isAudioFile, metaFromFilename, readTags, trackKeyFor, trackKeyForFile } from './tags';
import { getCachedAnalysis } from './db';
import { blobOf } from '@/services/tracks/bytes';
import { hasNativeFiles, NativeFiles, type NativeFile, type NativeMetadata } from '@/mobile/nativeFiles';

/**
 * Local file library.
 *
 * Three ways in, depending on the platform:
 *  • File System Access API (Chrome/Edge/desktop app) — directory handles are persisted and re-scanned.
 *  • Android Storage Access Framework (Capacitor) — content:// URIs with *persisted* read grants,
 *    which is the only way an Android WebView can keep access to a folder across restarts.
 *  • <input type=file> fallback — works everywhere, but the files cannot be re-opened next launch.
 *
 * Every added track is written to the IndexedDB `tracks` store so the library (and the crates/queue
 * that reference it) can be restored on the next launch — see restore().
 */

type Enrichable = { id: string; uri?: string; file?: File; row: StoredTrack };

async function enrichNative(items: Enrichable[]) {
  // MediaMetadataRetriever reads tags natively — no need to pull whole files into the WebView.
  const uris = items.map((i) => i.uri).filter((u): u is string => !!u);
  if (!uris.length) return;
  const byUri = new Map(items.filter((i) => i.uri).map((i) => [i.uri as string, i]));
  const BATCH = 40;
  for (let i = 0; i < uris.length; i += BATCH) {
    let tracks: NativeMetadata[] = [];
    try {
      tracks = (await NativeFiles.readMetadata({ uris: uris.slice(i, i + BATCH) })).tracks ?? [];
    } catch {
      // one unreadable batch shouldn't stop the rest — those tracks keep filename metadata
      useLibrary.getState().setScanning({ done: Math.min(i + BATCH, uris.length) });
      continue;
    }
    const rows: StoredTrack[] = [];
    for (const t of tracks) {
      const item = byUri.get(t.uri);
      if (!item) continue;
      const patch: Partial<TrackMeta> = {};
      if (t.title) patch.title = t.title;
      if (t.artist) patch.artist = t.artist;
      else if (t.albumArtist) patch.artist = t.albumArtist;
      if (t.album) patch.album = t.album;
      if (t.genre) patch.genre = t.genre;
      const year = Number(String(t.year ?? t.date ?? '').slice(0, 4));
      if (year > 1900 && year < 2200) patch.year = year;
      if (t.durationSec && t.durationSec > 0) patch.durationSec = t.durationSec;
      const cached = await getCachedAnalysis(item.id);
      if (cached) {
        patch.bpm = cached.bpm || patch.bpm;
        patch.key = cached.key.camelot || patch.key;
        patch.durationSec = cached.duration || patch.durationSec;
      }
      useLibrary.getState().updateLocalTrack(item.id, patch);
      rows.push({ ...item.row, meta: { ...item.row.meta, ...patch } });
    }
    await putStoredTracks(rows);
    useLibrary.getState().setScanning({ done: Math.min(i + BATCH, uris.length) });
    await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive on big folders
  }
}

/**
 * Cover art from tags can be several hundred KB; the library keeps thousands of rows, so shrink it
 * to a 256 px JPEG (~15 kB) before it ever reaches IndexedDB.
 */
async function shrinkArtwork(dataUrl: string): Promise<string> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size < 32_000) return dataUrl;
    const bmp = await createImageBitmap(blob);
    const size = 256;
    const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    if (out.size >= blob.size) return dataUrl;
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(dataUrl);
      fr.readAsDataURL(out);
    });
  } catch {
    return dataUrl;
  }
}

/** Fill restored rows with BPM/key/duration we already analysed in an earlier session. */
async function mergeCachedAnalysis(refs: TrackRef[]) {
  const rowsById = new Map((await getStoredTracks()).map((r) => [r.id, r]));
  const updated: StoredTrack[] = [];
  for (const ref of refs) {
    if (ref.meta.bpm && ref.meta.key) continue;
    const cached = await getCachedAnalysis(ref.meta.id);
    if (!cached) continue;
    const patch = { bpm: cached.bpm || ref.meta.bpm, key: cached.key.camelot || ref.meta.key, durationSec: cached.duration || ref.meta.durationSec };
    useLibrary.getState().updateLocalTrack(ref.meta.id, patch);
    const row = rowsById.get(ref.meta.id);
    if (row) updated.push({ ...row, meta: { ...row.meta, ...patch } });
  }
  await putStoredTracks(updated);
}

/** "Music/House/track.mp3" → "Music/House" (undefined when the file has no folder context). */
export function folderFromRelativePath(relativePath?: string): string | undefined {
  if (!relativePath) return undefined;
  const clean = relativePath.replace(/^\/+/, '');
  const i = clean.lastIndexOf('/');
  return i > 0 ? clean.slice(0, i) : undefined;
}

export const LocalLibrary = {
  /**
   * Add File objects to the library; tags parsed in the background.
   * `folderOf` supplies the display folder for each file (directory walk, drop, or
   * webkitRelativePath) so the library can be browsed the way it is laid out on disk.
   */
  async addFiles(files: File[], opts: { folderOf?: (f: File) => string | undefined } = {}): Promise<TrackRef[]> {
    const audio = files.filter(isAudioFile);
    if (!audio.length) return [];
    const lib = useLibrary.getState();
    const folderOf = opts.folderOf ?? ((f: File) => folderFromRelativePath((f as File & { webkitRelativePath?: string }).webkitRelativePath));
    const refs: TrackRef[] = audio.map((file) => {
      const g = metaFromFilename(file.name);
      return { kind: 'local', file, meta: { id: trackKeyForFile(file), title: g.title, artist: g.artist, folder: folderOf(file), addedAt: Date.now() } };
    });
    lib.addLocalTracks(refs);
    // metadata we already extracted in an earlier session — re-parsing every file on every
    // startup re-scan is slow and leaks one artwork object URL per track
    const storedById = new Map((await getStoredTracks()).map((r) => [r.id, r]));
    const known = refs.filter((r) => storedById.get(r.meta.id)?.meta.title);
    const refreshed: StoredTrack[] = [];
    for (const r of known) {
      const row = storedById.get(r.meta.id)!;
      // ids are path-independent, so a file that moved (or a renamed folder) keeps its row —
      // the folder we just walked is the truth, everything else comes from the stored tags
      const folder = r.meta.folder ?? row.meta.folder;
      useLibrary.getState().updateLocalTrack(r.meta.id, { ...row.meta, id: r.meta.id, folder });
      if (folder !== row.meta.folder) refreshed.push({ ...row, meta: { ...row.meta, folder }, relativePath: folder });
    }
    if (refreshed.length) await putStoredTracks(refreshed);
    const todo = refs.filter((r) => !storedById.get(r.meta.id)?.meta.title);
    if (!todo.length) return refs;
    lib.setScanning({ active: true, done: 0, total: todo.length });
    // enrich sequentially in small batches to keep UI smooth
    let done = 0;
    const batch = 3;
    for (let i = 0; i < todo.length; i += batch) {
      await Promise.all(
        todo.slice(i, i + batch).map(async (r) => {
          if (r.kind !== 'local') return;
          const [tags, cached] = await Promise.all([readTags(r.file), getCachedAnalysis(r.meta.id)]);
          const patch = {
            ...tags,
            bpm: cached?.bpm || tags.bpm,
            key: cached?.key.camelot || tags.key,
            durationSec: cached?.duration || tags.durationSec,
          };
          useLibrary.getState().updateLocalTrack(r.meta.id, patch);
          void putStoredTracks([
            {
              id: r.meta.id,
              meta: { ...r.meta, ...patch },
              source: 'local',
              fileName: r.file.name,
              size: r.file.size,
              lastModified: r.file.lastModified,
              relativePath: r.meta.folder,
              addedAt: Date.now(),
            },
          ]);
          done++;
          useLibrary.getState().setScanning({ done });
        }),
      );
    }
    useLibrary.getState().setScanning({ active: false });
    return refs;
  },

  /** Add Android SAF documents (content:// URIs with a persisted read grant). */
  async addNativeFiles(files: NativeFile[], opts: { folderUri?: string; folderName?: string; enrich?: boolean } = {}): Promise<TrackRef[]> {
    if (!files.length) return [];
    const lib = useLibrary.getState();
    const known = new Set(lib.localTracks.map((t) => t.meta.id));
    const refs: TrackRef[] = [];
    const rows: StoredTrack[] = [];
    const pending: Enrichable[] = [];
    for (const f of files) {
      const id = trackKeyFor(f.name, f.size, f.lastModified, f.uri);
      if (known.has(id)) continue;
      known.add(id);
      const g = metaFromFilename(f.name);
      const folder = [opts.folderName, f.relativePath].filter(Boolean).join('/') || undefined;
      const meta: TrackMeta = { id, title: g.title, artist: g.artist, folder, addedAt: Date.now() };
      const ref: TrackRef = { kind: 'native', uri: f.uri, meta };
      const row: StoredTrack = {
        id,
        meta,
        source: 'native',
        fileName: f.name,
        size: f.size,
        lastModified: f.lastModified,
        relativePath: f.relativePath,
        uri: f.uri,
        folderUri: opts.folderUri,
        addedAt: Date.now(),
      };
      refs.push(ref);
      rows.push(row);
      pending.push({ id, uri: f.uri, row });
    }
    if (!refs.length) return [];
    lib.addLocalTracks(refs);
    await putStoredTracks(rows);
    if (opts.enrich !== false) {
      lib.setScanning({ active: true, done: 0, total: refs.length });
      await enrichNative(pending);
      useLibrary.getState().setScanning({ active: false, done: refs.length });
    }
    return refs;
  },

  /** Open the OS file picker. */
  async pickFiles(): Promise<TrackRef[]> {
    if (hasNativeFiles()) {
      const res = await NativeFiles.pickFiles();
      if (res.cancelled || !res.files?.length) return [];
      const transient = res.files.filter((f) => f.persisted === false).length;
      if (transient) {
        toast.warning(`${transient} file${transient === 1 ? " won't be" : "s won't be"} remembered next launch`, {
          description: 'Android limits how many single files an app can keep access to — add the folder instead.',
          duration: 6000,
        });
      }
      return this.addNativeFiles(res.files);
    }
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

  /** Open a folder (recursively). The grant is persisted so it can be re-scanned next launch. */
  async pickFolder(): Promise<TrackRef[]> {
    if (hasNativeFiles()) {
      const picked = await NativeFiles.pickFolder();
      if (picked.cancelled || !picked.uri) return [];
      return this.scanNativeFolder(picked.uri);
    }
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

  /**
   * (Re-)scan an Android folder the user granted earlier and reconcile it with the library:
   * new files are added, moved/renamed files get their fresh URI, and files that are gone from
   * the folder are dropped — otherwise the library would only ever grow.
   */
  async scanNativeFolder(uri: string, opts: { enrich?: boolean } = {}): Promise<TrackRef[]> {
    useLibrary.getState().setScanning({ active: true, done: 0, total: 0 });
    try {
      const res = await NativeFiles.listFolder({ uri });
      const files = res.files ?? [];
      const seen = new Map(files.map((f) => [trackKeyFor(f.name, f.size, f.lastModified, f.uri), f]));
      const rows = await getStoredTracks();
      const mine = rows.filter((r) => r.folderUri === uri);

      // refresh URIs that changed (a moved file keeps its id) and forget vanished ones
      const moved: StoredTrack[] = [];
      const gone: string[] = [];
      const folderName = res.name;
      for (const row of mine) {
        const f = seen.get(row.id);
        if (!f) {
          gone.push(row.id);
          continue;
        }
        const folder = [folderName, f.relativePath].filter(Boolean).join('/') || undefined;
        if (f.uri !== row.uri || row.relativePath !== f.relativePath || row.meta.folder !== folder) {
          moved.push({ ...row, uri: f.uri, relativePath: f.relativePath, meta: { ...row.meta, folder } });
        }
      }
      if (moved.length) await putStoredTracks(moved);
      if (gone.length) {
        await deleteStoredTracks(gone);
        for (const id of gone) useLibrary.getState().removeLocalTrack(id);
      }
      if (moved.length) {
        const byId = new Map(moved.map((r) => [r.id, r]));
        useLibrary
          .getState()
          .replaceLocalTracks((t) => (t.kind === 'native' && byId.has(t.meta.id) ? { ...t, uri: byId.get(t.meta.id)!.uri!, meta: { ...t.meta, folder: byId.get(t.meta.id)!.meta.folder } } : t));
      }
      return await this.addNativeFiles(files, { folderUri: uri, folderName: res.name, enrich: opts.enrich });
    } catch {
      return [];
    } finally {
      useLibrary.getState().setScanning({ active: false });
    }
  },

  async scanDirectory(dir: FileSystemDirectoryHandle): Promise<TrackRef[]> {
    const files: File[] = [];
    const folders = new Map<File, string>();
    const walk = async (d: FileSystemDirectoryHandle, path: string, depth: number) => {
      if (depth > 6) return;
      for await (const [, h] of (d as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        if (h.kind === 'file') {
          const f = await (h as FileSystemFileHandle).getFile();
          if (!isAudioFile(f)) continue;
          files.push(f);
          folders.set(f, path);
        } else if (h.kind === 'directory') {
          const child = h as FileSystemDirectoryHandle;
          await walk(child, `${path}/${child.name}`, depth + 1);
        }
      }
    };
    await walk(dir, dir.name, 0);
    return this.addFiles(files, { folderOf: (f) => folders.get(f) });
  },

  /**
   * Bring the library back on startup:
   *  1. Android — re-create tracks from stored SAF URIs whose grant is still held (instant), then
   *     re-scan those folders in the background so new/removed files show up.
   *  2. Desktop/web — silently re-scan File System Access folders whose permission is still granted
   *     (no prompt: a prompt needs a user gesture, so those wait for the button in Settings).
   * Returns how many tracks came back and how many stored rows could not be re-opened.
   */
  async restore(): Promise<{ tracks: number; unavailable: number }> {
    const rows = await getStoredTracks();
    let restored = 0;
    let unavailable = 0;

    if (hasNativeFiles()) {
      const native = rows.filter((r) => r.source === 'native' && r.uri);
      let folders: { uri: string; name: string }[] = [];
      try {
        folders = (await NativeFiles.savedFolders()).folders;
      } catch {
        folders = [];
      }
      const rootOf = (uri: string) => folders.find((f) => uri === f.uri || uri.startsWith(`${f.uri}/document/`));
      const covered = (uri: string) => !!rootOf(uri);
      // rows written before folder browsing existed only have relativePath — rebuild the display path
      const withFolder = (r: StoredTrack): TrackMeta =>
        r.meta.folder ? r.meta : { ...r.meta, folder: [rootOf(r.uri!)?.name, r.relativePath].filter(Boolean).join('/') || undefined };
      const keep: TrackRef[] = [];
      const drop: string[] = [];
      const loose: StoredTrack[] = [];
      for (const r of native) {
        if (covered(r.uri!)) keep.push({ kind: 'native', uri: r.uri!, meta: withFolder(r) });
        else loose.push(r);
      }
      // individually picked files hold their own grant — check them all, in small parallel batches
      for (let i = 0; i < loose.length; i += 20) {
        const chunk = loose.slice(i, i + 20);
        const granted = await Promise.all(
          chunk.map((r) =>
            NativeFiles.hasAccess({ uri: r.uri! })
              .then((x) => x.granted)
              .catch(() => false),
          ),
        );
        chunk.forEach((r, j) => {
          if (granted[j]) keep.push({ kind: 'native', uri: r.uri!, meta: withFolder(r) });
          else drop.push(r.id);
        });
      }
      if (keep.length) {
        useLibrary.getState().addLocalTracks(keep);
        void mergeCachedAnalysis(keep);
      }
      if (drop.length) await deleteStoredTracks(drop);
      restored += keep.length;
      unavailable += drop.length;
      // pick up folder changes without blocking startup
      if (folders.length) {
        void (async () => {
          for (const f of folders) await this.scanNativeFolder(f.uri);
        })();
      }
    } else {
      unavailable += rows.filter((r) => r.source === 'local').length;
      // FS Access: re-scan folders we still hold permission for, without prompting
      try {
        const db = await getDb();
        const handles = await db.getAll('handles');
        for (const rec of handles) {
          const h: any = rec.handle;
          const perm = await h?.queryPermission?.({ mode: 'read' });
          if (perm !== 'granted') continue;
          const refs = await this.scanDirectory(rec.handle);
          restored += refs.length;
          unavailable = Math.max(0, unavailable - refs.length);
        }
      } catch {
        /* no handles / not supported */
      }
    }
    useLibrary.getState().setUnavailable(unavailable);
    return { tracks: restored, unavailable };
  },

  /** Re-open previously granted folders (requires a user gesture for the permission prompt). */
  async restoreFolders(): Promise<number> {
    if (hasNativeFiles()) {
      try {
        const { folders } = await NativeFiles.savedFolders();
        for (const f of folders) await this.scanNativeFolder(f.uri);
        return folders.length;
      } catch {
        return 0;
      }
    }
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

  async savedFolders(): Promise<{ id: string; name: string }[]> {
    if (hasNativeFiles()) {
      try {
        const { folders } = await NativeFiles.savedFolders();
        return folders.map((f) => ({ id: f.uri, name: f.name }));
      } catch {
        return [];
      }
    }
    try {
      const db = await getDb();
      const all = await db.getAll('handles');
      return all.map((h) => ({ id: h.id, name: h.name }));
    } catch {
      return [];
    }
  },

  async forgetFolder(id: string) {
    if (hasNativeFiles()) {
      try {
        await NativeFiles.forgetFolder({ uri: id });
      } catch {
        /* already gone */
      }
      const rows = (await getStoredTracks()).filter((r) => r.folderUri === id);
      await deleteStoredTracks(rows.map((r) => r.id));
      const ids = new Set(rows.map((r) => r.id));
      for (const t of useLibrary.getState().localTracks) if (ids.has(t.meta.id)) useLibrary.getState().removeLocalTrack(t.meta.id);
      return;
    }
    try {
      const db = await getDb();
      await db.delete('handles', id);
    } catch {
      /* noop */
    }
  },

  /**
   * Fetch embedded cover art for a track that doesn't have any yet.
   * Android reads it natively (no file download); elsewhere it comes from the tag parser.
   * Called when a track lands on a deck, so only the tracks you actually play pay for it.
   */
  async loadArtwork(track: TrackRef): Promise<string | undefined> {
    if (track.meta.artworkUrl) return track.meta.artworkUrl;
    let artworkUrl: string | undefined;
    if (track.kind === 'native' && hasNativeFiles()) {
      try {
        const { tracks } = await NativeFiles.readMetadata({ uris: [track.uri], artwork: true });
        const b64 = tracks[0]?.artwork;
        if (b64) artworkUrl = `data:${b64.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg'};base64,${b64}`;
      } catch {
        return undefined;
      }
    } else if (track.kind === 'local') {
      const blob = await blobOf(track);
      if (!blob) return undefined;
      const tags = await readTags(blob, track.file.name);
      artworkUrl = tags.artworkUrl;
    }
    if (!artworkUrl) return undefined;
    if (artworkUrl.startsWith('data:')) artworkUrl = await shrinkArtwork(artworkUrl);
    useLibrary.getState().updateLocalTrack(track.meta.id, { artworkUrl });
    // blob: URLs die with the document, so only data: art is worth persisting
    if (artworkUrl.startsWith('data:')) {
      const row = await getStoredTrack(track.meta.id);
      if (row) await putStoredTracks([{ ...row, meta: { ...row.meta, artworkUrl } }]);
    }
    return artworkUrl;
  },
};
