import type { TrackRef } from '@/services/tracks/TrackRef';

export interface FolderNode {
  /** full path, e.g. "Music/House/2024" */
  path: string;
  /** last segment, e.g. "2024" */
  name: string;
  /** tracks directly in this folder */
  count: number;
  /** tracks in this folder and everything below it */
  total: number;
  children: FolderNode[];
}

/**
 * Build the folder tree of the library from each track's `meta.folder`.
 * Tracks added as individual files (no folder context) are grouped under a single "Loose files"
 * node so nothing disappears from the tree view.
 */
export const LOOSE_FILES = 'Loose files';

export function buildFolderTree(tracks: TrackRef[]): { roots: FolderNode[]; total: number } {
  const byPath = new Map<string, FolderNode>();
  const node = (path: string): FolderNode => {
    let n = byPath.get(path);
    if (!n) {
      n = { path, name: path.slice(path.lastIndexOf('/') + 1), count: 0, total: 0, children: [] };
      byPath.set(path, n);
      const i = path.lastIndexOf('/');
      if (i > 0) node(path.slice(0, i)).children.push(n);
    }
    return n;
  };

  for (const t of tracks) {
    const path = t.meta.folder || LOOSE_FILES;
    node(path).count++;
    // count the track for every ancestor as well
    let p: string | null = path;
    while (p) {
      node(p).total++;
      const i: number = p.lastIndexOf('/');
      p = i > 0 ? p.slice(0, i) : null;
    }
  }

  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => (a.path === LOOSE_FILES ? 1 : b.path === LOOSE_FILES ? -1 : a.name.localeCompare(b.name, undefined, { numeric: true })));
    for (const n of nodes) sort(n.children);
  };
  const roots = [...byPath.values()].filter((n) => !n.path.includes('/') || !byPath.has(n.path.slice(0, n.path.lastIndexOf('/'))));
  sort(roots);
  return { roots, total: tracks.length };
}

/** Tracks inside `path` (including sub-folders). `null` means the whole library. */
export function tracksInFolder(tracks: TrackRef[], path: string | null): TrackRef[] {
  if (!path) return tracks;
  const prefix = `${path}/`;
  return tracks.filter((t) => {
    const f = t.meta.folder || LOOSE_FILES;
    return f === path || f.startsWith(prefix);
  });
}

/** Does this path still exist in the tree? (used to drop a selection whose folder is gone) */
export function folderExists(roots: FolderNode[], path: string): boolean {
  const walk = (nodes: FolderNode[]): boolean =>
    nodes.some((n) => n.path === path || (path.startsWith(`${n.path}/`) && walk(n.children)));
  return walk(roots);
}

/** Breadcrumb segments for a path: [{name, path}, …]. */
export function folderCrumbs(path: string): { name: string; path: string }[] {
  const parts = path.split('/');
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
}
