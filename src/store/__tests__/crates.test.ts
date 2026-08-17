import { beforeEach, describe, expect, it } from 'vitest';
import { useCrates } from '../crates';
import type { TrackRef } from '@/services/tracks/TrackRef';

const t = (id: string, title = id): TrackRef => ({ kind: 'demo', url: `/x/${id}.wav`, meta: { id, title, artist: 'a', durationSec: 60 } });

describe('crates + queue store', () => {
  beforeEach(() => {
    useCrates.setState({ crates: [], queue: [], metaById: {}, selectedCrateId: null });
  });

  it('creates crates, dedupes tracks and keeps a meta snapshot', () => {
    const s = useCrates.getState();
    const id = s.createCrate('  Peak time ', [t('a'), t('b')]);
    useCrates.getState().addToCrate(id, [t('b'), t('c')]);
    const c = useCrates.getState().crates[0];
    expect(c.name).toBe('Peak time');
    expect(c.trackIds).toEqual(['a', 'b', 'c']);
    expect(useCrates.getState().metaById.c.title).toBe('c');
    expect(useCrates.getState().selectedCrateId).toBe(id);
    useCrates.getState().removeFromCrate(id, 'b');
    expect(useCrates.getState().crates[0].trackIds).toEqual(['a', 'c']);
    useCrates.getState().deleteCrate(id);
    expect(useCrates.getState().crates).toHaveLength(0);
    expect(useCrates.getState().selectedCrateId).toBeNull();
  });

  it('queue keeps order, supports play-next, move, shift and duplicates', () => {
    const s = useCrates.getState();
    s.enqueue([t('a'), t('b')]);
    useCrates.getState().enqueue([t('c')], { next: true });
    useCrates.getState().enqueue([t('a')]); // same track twice is fine
    let q = useCrates.getState().queue;
    expect(q.map((x) => x.trackId)).toEqual(['c', 'a', 'b', 'a']);
    expect(new Set(q.map((x) => x.uid)).size).toBe(4);
    useCrates.getState().moveInQueue(3, 0);
    q = useCrates.getState().queue;
    expect(q.map((x) => x.trackId)).toEqual(['a', 'c', 'a', 'b']);
    const head = useCrates.getState().shiftQueue();
    expect(head?.trackId).toBe('a');
    expect(useCrates.getState().queue.map((x) => x.trackId)).toEqual(['c', 'a', 'b']);
    useCrates.getState().dequeue(useCrates.getState().queue[1].uid);
    expect(useCrates.getState().queue.map((x) => x.trackId)).toEqual(['c', 'b']);
    useCrates.getState().clearQueue();
    expect(useCrates.getState().shiftQueue()).toBeNull();
  });

  it('drops blob artwork urls from the persisted snapshot', () => {
    useCrates.getState().enqueue([{ ...t('a'), meta: { ...t('a').meta, artworkUrl: 'blob:http://x/1' } }]);
    expect(useCrates.getState().metaById.a.artworkUrl).toBeUndefined();
  });
});
