import { describe, expect, it, beforeEach } from 'vitest';
import { trackKeyFor, trackKeyForFile } from '../tags';
import { useCrates } from '@/store/crates';
import { useDeckPrefs } from '@/store/deckPrefs';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { buildFolderTree, folderCrumbs, folderExists, tracksInFolder, LOOSE_FILES } from '../folders';

const nativeTrack = (id: string, artworkUrl?: string): TrackRef => ({
  kind: 'native',
  uri: `content://tree/primary%3AMusic/document/${id}`,
  meta: { id, title: id, artist: 'a', artworkUrl },
});

describe('stable track ids', () => {
  it('matches for a File and the equivalent SAF document (keeps analysis/cues caches warm)', () => {
    const file = new File([new Uint8Array(8)], 'Night Drive.mp3', { lastModified: 1_700_000_000_000 });
    expect(trackKeyForFile(file)).toBe(trackKeyFor('Night Drive.mp3', file.size, 1_700_000_000_000));
    expect(trackKeyForFile(file)).toBe('local:Night Drive.mp3|8|1700000000000');
  });

  it('falls back to a per-file token when the provider reports neither size nor mtime', () => {
    expect(trackKeyFor('track.mp3', 0, 0, 'content://a')).not.toBe(trackKeyFor('track.mp3', 0, 0, 'content://b'));
  });

  it('ignores the fallback as soon as size or mtime is known', () => {
    expect(trackKeyFor('t.mp3', 10, 0, 'content://a')).toBe(trackKeyFor('t.mp3', 10, 0, 'content://b'));
  });
});

describe('crates / queue persistence', () => {
  beforeEach(() => useCrates.setState({ crates: [], queue: [], metaById: {}, selectedCrateId: null }));

  it('keeps embedded cover art out of the localStorage snapshot', () => {
    useCrates.getState().enqueue([nativeTrack('t1', 'data:image/jpeg;base64,AAAA'), nativeTrack('t2', 'blob:http://x/1')]);
    useCrates.getState().createCrate('set', [nativeTrack('t3', 'data:image/png;base64,BBBB')]);
    const meta = useCrates.getState().metaById;
    expect(meta.t1.artworkUrl).toBeUndefined();
    expect(meta.t2.artworkUrl).toBeUndefined();
    expect(meta.t3.artworkUrl).toBeUndefined();
  });

  it('keeps embedded art out of the queue rows themselves', () => {
    useCrates.getState().enqueue([nativeTrack('q1', 'data:image/jpeg;base64,AAAA')]);
    expect(useCrates.getState().queue[0].meta.artworkUrl).toBeUndefined();
  });

  it('prunes metadata once nothing references it any more', () => {
    useCrates.getState().enqueue([nativeTrack('p1'), nativeTrack('p2')]);
    expect(Object.keys(useCrates.getState().metaById).sort()).toEqual(['p1', 'p2']);
    useCrates.getState().dequeue(useCrates.getState().queue[0].uid);
    expect(Object.keys(useCrates.getState().metaById)).toEqual(['p2']);
    useCrates.getState().clearQueue();
    expect(useCrates.getState().metaById).toEqual({});
  });

  it('keeps a plain remote artwork URL', () => {
    useCrates.getState().enqueue([nativeTrack('t4', 'https://cdn/x.jpg')]);
    expect(useCrates.getState().metaById.t4.artworkUrl).toBe('https://cdn/x.jpg');
  });
});

describe('deck prefs', () => {
  it('holds switch positions only — never transport state', () => {
    expect(Object.keys(useDeckPrefs.getState().decks.A).sort()).toEqual(['autoLoopBeats', 'keylock', 'quantize', 'slip']);
  });

  it('patches one deck without touching the others', () => {
    useDeckPrefs.getState().set('B', { keylock: true });
    expect(useDeckPrefs.getState().decks.B.keylock).toBe(true);
    expect(useDeckPrefs.getState().decks.A.keylock).toBe(false);
  });
});

describe('folder tree', () => {
  const t = (id: string, folder?: string): TrackRef => ({ kind: 'demo', url: `/x/${id}`, meta: { id, title: id, artist: 'a', folder } });

  it('nests folders and counts tracks per branch', () => {
    const { roots, total } = buildFolderTree([
      t('a', 'Crate/House/2024'),
      t('b', 'Crate/House/2024'),
      t('c', 'Crate/House/2023'),
      t('d', 'Crate/Techno'),
      t('e', 'Crate'),
    ]);
    expect(total).toBe(5);
    expect(roots.map((r) => r.path)).toEqual(['Crate']);
    expect(roots[0].total).toBe(5);
    expect(roots[0].count).toBe(1); // only "e" sits directly in Crate
    expect(roots[0].children.map((c) => `${c.name}:${c.total}`)).toEqual(['House:3', 'Techno:1']);
    expect(roots[0].children[0].children.map((c) => `${c.name}:${c.total}`)).toEqual(['2023:1', '2024:2']);
  });

  it('groups tracks without a folder under Loose files, sorted last', () => {
    const { roots } = buildFolderTree([t('a'), t('b', 'Zed'), t('c', 'Alpha')]);
    expect(roots.map((r) => r.path)).toEqual(['Alpha', 'Zed', LOOSE_FILES]);
  });

  it('filters by prefix without matching sibling names that share it', () => {
    const tracks = [t('a', 'Rock'), t('b', 'Rock/70s'), t('c', 'Rock Ballads')];
    expect(tracksInFolder(tracks, 'Rock').map((x) => x.meta.id)).toEqual(['a', 'b']);
    expect(tracksInFolder(tracks, null)).toHaveLength(3);
  });

  it('knows when a selected folder no longer exists', () => {
    const { roots } = buildFolderTree([t('a', 'Crate/House')]);
    expect(folderExists(roots, 'Crate/House')).toBe(true);
    expect(folderExists(roots, 'Crate')).toBe(true);
    expect(folderExists(roots, 'Crate/Techno')).toBe(false);
  });

  it('builds breadcrumbs for the drill-down bar', () => {
    expect(folderCrumbs('Crate/House/2024')).toEqual([
      { name: 'Crate', path: 'Crate' },
      { name: 'House', path: 'Crate/House' },
      { name: '2024', path: 'Crate/House/2024' },
    ]);
  });
});
