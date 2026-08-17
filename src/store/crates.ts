import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackMeta, TrackRef } from '@/services/tracks/TrackRef';

/**
 * Crates (user playlists) and the play queue. Both persist only track ids + a metadata snapshot
 * (TrackRefs hold File objects); the live TrackRef is resolved through the library registry when
 * needed, and rows whose file is no longer in the library render as "missing".
 */
export interface Crate {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface QueueItem {
  uid: string; // unique per queue entry (the same track may be queued twice)
  trackId: string;
  meta: TrackMeta;
}

interface CratesState {
  crates: Crate[];
  queue: QueueItem[];
  /** metadata snapshot of every track referenced by a crate/queue, so rows still render when the file is gone */
  metaById: Record<string, TrackMeta>;
  selectedCrateId: string | null;
  createCrate: (name: string, tracks?: TrackRef[]) => string;
  renameCrate: (id: string, name: string) => void;
  deleteCrate: (id: string) => void;
  selectCrate: (id: string | null) => void;
  addToCrate: (crateId: string, tracks: TrackRef[]) => void;
  removeFromCrate: (crateId: string, trackId: string) => void;
  moveInCrate: (crateId: string, from: number, to: number) => void;
  enqueue: (tracks: TrackRef[], opts?: { next?: boolean }) => void;
  dequeue: (uid: string) => void;
  moveInQueue: (from: number, to: number) => void;
  /** Remove and return the head of the queue. */
  shiftQueue: () => QueueItem | null;
  clearQueue: () => void;
  shuffleQueue: () => void;
}

const withMeta = (m: Record<string, TrackMeta>, tracks: TrackRef[]) => {
  if (!tracks.length) return m;
  const out = { ...m };
  for (const t of tracks) out[t.meta.id] = { ...t.meta, artworkUrl: t.meta.artworkUrl?.startsWith('blob:') ? undefined : t.meta.artworkUrl };
  return out;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const move = <T,>(arr: T[], from: number, to: number) => {
  const a = arr.slice();
  const [x] = a.splice(from, 1);
  a.splice(Math.max(0, Math.min(a.length, to)), 0, x);
  return a;
};

export const useCrates = create<CratesState>()(
  persist(
    (set, get) => ({
      crates: [],
      queue: [],
      metaById: {},
      selectedCrateId: null,
      createCrate: (name, tracks = []) => {
        const id = uid();
        set((s) => ({
          crates: [...s.crates, { id, name: name.trim() || 'New crate', trackIds: [...new Set(tracks.map((t) => t.meta.id))], createdAt: Date.now() }],
          metaById: withMeta(s.metaById, tracks),
          selectedCrateId: id,
        }));
        return id;
      },
      renameCrate: (id, name) => set((s) => ({ crates: s.crates.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)) })),
      deleteCrate: (id) => set((s) => ({ crates: s.crates.filter((c) => c.id !== id), selectedCrateId: s.selectedCrateId === id ? null : s.selectedCrateId })),
      selectCrate: (selectedCrateId) => set({ selectedCrateId }),
      addToCrate: (crateId, tracks) =>
        set((s) => ({
          metaById: withMeta(s.metaById, tracks),
          crates: s.crates.map((c) => {
            if (c.id !== crateId) return c;
            const seen = new Set(c.trackIds);
            return { ...c, trackIds: [...c.trackIds, ...tracks.map((t) => t.meta.id).filter((t) => !seen.has(t))] };
          }),
        })),
      removeFromCrate: (crateId, trackId) => set((s) => ({ crates: s.crates.map((c) => (c.id === crateId ? { ...c, trackIds: c.trackIds.filter((t) => t !== trackId) } : c)) })),
      moveInCrate: (crateId, from, to) => set((s) => ({ crates: s.crates.map((c) => (c.id === crateId ? { ...c, trackIds: move(c.trackIds, from, to) } : c)) })),
      enqueue: (tracks, opts) =>
        set((s) => {
          const items = tracks.map((t) => ({ uid: uid(), trackId: t.meta.id, meta: t.meta }));
          return { metaById: withMeta(s.metaById, tracks), queue: opts?.next ? [...items, ...s.queue] : [...s.queue, ...items] };
        }),
      dequeue: (u) => set((s) => ({ queue: s.queue.filter((q) => q.uid !== u) })),
      moveInQueue: (from, to) => set((s) => ({ queue: move(s.queue, from, to) })),
      shiftQueue: () => {
        const head = get().queue[0] ?? null;
        if (head) set((s) => ({ queue: s.queue.slice(1) }));
        return head;
      },
      clearQueue: () => set({ queue: [] }),
      shuffleQueue: () =>
        set((s) => {
          const q = s.queue.slice();
          for (let i = q.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [q[i], q[j]] = [q[j], q[i]];
          }
          return { queue: q };
        }),
    }),
    { name: 'djkado.crates', partialize: (s) => ({ crates: s.crates, queue: s.queue, metaById: s.metaById, selectedCrateId: s.selectedCrateId }) },
  ),
);
