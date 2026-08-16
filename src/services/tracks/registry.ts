import { useLibrary } from '@/store/library';
import type { TrackRef } from './TrackRef';

/** Find a TrackRef by id across all loaded library sources. */
export function findTrack(id: string): TrackRef | null {
  const s = useLibrary.getState();
  const local = s.localTracks.find((t) => t.meta.id === id);
  if (local) return local;
  for (const list of Object.values(s.playlistTracks)) {
    const t = list.find((x) => x.meta.id === id);
    if (t) return t;
  }
  return null;
}

export const DND_MIME = 'application/x-djkado-track';
