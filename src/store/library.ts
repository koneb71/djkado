import { create } from 'zustand';
import type { TrackRef } from '@/services/tracks/TrackRef';

export type SourceId = 'local' | 'spotify' | 'apple' | 'history' | 'crates' | 'queue';

export interface Playlist {
  id: string;
  name: string;
  source: SourceId;
  trackCount?: number;
  artworkUrl?: string;
}

interface LibraryState {
  source: SourceId;
  search: string;
  localTracks: TrackRef[];
  playlists: Record<SourceId, Playlist[]>;
  selectedPlaylist: Record<SourceId, string | null>;
  playlistTracks: Record<string, TrackRef[]>; // key: `${source}:${playlistId}`
  loading: boolean;
  scanning: { active: boolean; done: number; total: number };
  selectedTrackId: string | null;
  /** tracks stored from an earlier session whose files can no longer be opened (web only) */
  unavailableTracks: number;
  /** selected folder in the Local browser (null = whole library) */
  folderPath: string | null;
  sortKey: 'title' | 'artist' | 'bpm' | 'key' | 'duration' | 'added';
  sortDir: 'asc' | 'desc';
  setSource: (s: SourceId) => void;
  setSearch: (q: string) => void;
  addLocalTracks: (t: TrackRef[]) => void;
  updateLocalTrack: (id: string, patch: Partial<TrackRef['meta']>) => void;
  removeLocalTrack: (id: string) => void;
  /** map over the local tracks in place (used when a file moves and its URI changes) */
  replaceLocalTracks: (fn: (t: TrackRef) => TrackRef) => void;
  clearLocal: () => void;
  setPlaylists: (s: SourceId, p: Playlist[]) => void;
  selectPlaylist: (s: SourceId, id: string | null) => void;
  setPlaylistTracks: (key: string, t: TrackRef[]) => void;
  setLoading: (b: boolean) => void;
  setScanning: (p: Partial<LibraryState['scanning']>) => void;
  select: (id: string | null) => void;
  setSort: (k: LibraryState['sortKey']) => void;
  setUnavailable: (n: number) => void;
  setFolderPath: (p: string | null) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  source: 'local',
  search: '',
  localTracks: [],
  playlists: { local: [], spotify: [], apple: [], history: [], crates: [], queue: [] },
  selectedPlaylist: { local: null, spotify: null, apple: null, history: null, crates: null, queue: null },
  playlistTracks: {},
  loading: false,
  scanning: { active: false, done: 0, total: 0 },
  selectedTrackId: null,
  unavailableTracks: 0,
  folderPath: null,
  sortKey: 'added',
  sortDir: 'desc',
  setSource: (source) => set({ source }),
  setSearch: (search) => set({ search }),
  addLocalTracks: (t) =>
    set((s) => {
      const seen = new Set(s.localTracks.map((x) => x.meta.id));
      const fresh = t.filter((x) => !seen.has(x.meta.id));
      return { localTracks: [...s.localTracks, ...fresh] };
    }),
  updateLocalTrack: (id, patch) =>
    set((s) => ({ localTracks: s.localTracks.map((t) => (t.meta.id === id ? ({ ...t, meta: { ...t.meta, ...patch } } as TrackRef) : t)) })),
  removeLocalTrack: (id) => set((s) => ({ localTracks: s.localTracks.filter((t) => t.meta.id !== id) })),
  replaceLocalTracks: (fn) => set((s) => ({ localTracks: s.localTracks.map(fn) })),
  clearLocal: () => set({ localTracks: [] }),
  setPlaylists: (src, p) => set((s) => ({ playlists: { ...s.playlists, [src]: p } })),
  selectPlaylist: (src, id) => set((s) => ({ selectedPlaylist: { ...s.selectedPlaylist, [src]: id } })),
  setPlaylistTracks: (key, t) => set((s) => ({ playlistTracks: { ...s.playlistTracks, [key]: t } })),
  setLoading: (loading) => set({ loading }),
  setScanning: (p) => set((s) => ({ scanning: { ...s.scanning, ...p } })),
  select: (selectedTrackId) => set({ selectedTrackId }),
  setUnavailable: (unavailableTracks) => set({ unavailableTracks }),
  setFolderPath: (folderPath) => set({ folderPath }),
  setSort: (k) => set((s) => ({ sortKey: k, sortDir: s.sortKey === k ? (s.sortDir === 'asc' ? 'desc' : 'asc') : 'asc' })),
}));
