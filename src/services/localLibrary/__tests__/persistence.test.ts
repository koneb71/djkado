import { describe, expect, it, beforeEach } from 'vitest';
import { trackKeyFor, trackKeyForFile } from '../tags';
import { useCrates } from '@/store/crates';
import { useDeckPrefs } from '@/store/deckPrefs';
import type { TrackRef } from '@/services/tracks/TrackRef';

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
