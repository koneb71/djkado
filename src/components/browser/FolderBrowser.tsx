import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ChevronRight, Folder, FolderOpen, HardDrive, ListPlus, Box, ChevronLeft } from 'lucide-react';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { buildFolderTree, folderCrumbs, folderExists, tracksInFolder, type FolderNode } from '@/services/localLibrary/folders';
import { useLibrary } from '@/store/library';
import { useCrates } from '@/store/crates';
import { tap } from '@/mobile/native';
import { cn } from '@/ui/cn';

/** Drop the selection when its folder is no longer in the library (removed, forgotten, cleared). */
function usePrunedSelection(roots: FolderNode[]) {
  const selected = useLibrary((s) => s.folderPath);
  const setFolderPath = useLibrary((s) => s.setFolderPath);
  useEffect(() => {
    if (selected && roots.length && !folderExists(roots, selected)) setFolderPath(null);
  }, [selected, roots, setFolderPath]);
  return selected;
}

/** Queue / crate actions shared by both layouts. */
function useFolderActions(tracks: TrackRef[]) {
  const enqueue = useCrates((s) => s.enqueue);
  const createCrate = useCrates((s) => s.createCrate);
  return {
    queue: (node: FolderNode) => {
      const inFolder = tracksInFolder(tracks, node.path);
      enqueue(inFolder);
      toast.success(`Queued ${inFolder.length} track${inFolder.length === 1 ? '' : 's'} from “${node.name}”`);
    },
    crate: (node: FolderNode) => {
      const inFolder = tracksInFolder(tracks, node.path);
      createCrate(node.name, inFolder);
      toast.success(`Crate “${node.name}” created with ${inFolder.length} tracks`);
    },
  };
}

function TreeRow({ node, depth, tracks }: { node: FolderNode; depth: number; tracks: TrackRef[] }) {
  const selected = useLibrary((s) => s.folderPath);
  const setFolderPath = useLibrary((s) => s.setFolderPath);
  const onPath = !!selected && selected.startsWith(`${node.path}/`);
  // the selection lives in the store and survives remounts (tab switch, panel collapse) — the
  // tree has to re-open its branch, otherwise the table looks filtered for no visible reason
  const [open, setOpen] = useState(depth === 0 || onPath);
  useEffect(() => {
    if (onPath) setOpen(true);
  }, [onPath]);
  const actions = useFolderActions(tracks);
  const active = selected === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={cn('group flex h-7 items-center gap-1 rounded pr-1 text-xs', active ? 'bg-panel-3 text-text' : 'text-text-dim hover:bg-white/[0.04]')}
        style={{ paddingLeft: 4 + depth * 10 }}
      >
        <button
          type="button"
          className={cn('flex h-4 w-4 shrink-0 items-center justify-center text-text-faint', !hasChildren && 'invisible')}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronRight size={11} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setFolderPath(active ? null : node.path)} title={node.path}>
          {active ? <FolderOpen size={12} className="shrink-0 text-accent" /> : <Folder size={12} className="shrink-0 text-text-faint" />}
          <span className="truncate">{node.name}</span>
          <span className="ml-auto pl-1 text-[10px] text-text-faint">{node.total}</span>
        </button>
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button type="button" onClick={() => actions.queue(node)} className="text-text-faint hover:text-text" title="Add folder to queue" aria-label="Queue folder">
            <ListPlus size={11} />
          </button>
          <button type="button" onClick={() => actions.crate(node)} className="text-text-faint hover:text-text" title="Make a crate from this folder" aria-label="Crate from folder">
            <Box size={11} />
          </button>
        </span>
      </div>
      {open && node.children.map((c) => <TreeRow key={c.path} node={c} depth={depth + 1} tracks={tracks} />)}
    </>
  );
}

/** Desktop: folder tree sidebar for the local library. */
export function FolderTree({ tracks }: { tracks: TrackRef[] }) {
  const { roots, total } = useMemo(() => buildFolderTree(tracks), [tracks]);
  const selected = usePrunedSelection(roots);
  const setFolderPath = useLibrary((s) => s.setFolderPath);
  if (!roots.length) return null;
  return (
    <aside className="flex w-52 shrink-0 flex-col overflow-auto border-r border-border p-1.5">
      <div className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-widest text-text-faint">Folders</div>
      <button
        type="button"
        onClick={() => setFolderPath(null)}
        className={cn('flex h-7 items-center gap-1.5 rounded px-1.5 text-xs', selected === null ? 'bg-panel-3 text-text' : 'text-text-dim hover:bg-white/[0.04]')}
      >
        <HardDrive size={12} className="shrink-0 text-text-faint" />
        <span className="truncate">All tracks</span>
        <span className="ml-auto text-[10px] text-text-faint">{total}</span>
      </button>
      {roots.map((n) => (
        <TreeRow key={n.path} node={n} depth={0} tracks={tracks} />
      ))}
    </aside>
  );
}

/** Phones: breadcrumb + one row of sub-folder chips (drill down like a file browser). */
export function FolderBar({ tracks }: { tracks: TrackRef[] }) {
  const { roots, total } = useMemo(() => buildFolderTree(tracks), [tracks]);
  const selected = usePrunedSelection(roots);
  const setFolderPath = useLibrary((s) => s.setFolderPath);
  const actions = useFolderActions(tracks);

  const level = useMemo(() => {
    if (!selected) return roots;
    const find = (nodes: FolderNode[]): FolderNode | undefined => {
      for (const n of nodes) {
        if (n.path === selected) return n;
        if (selected.startsWith(`${n.path}/`)) return find(n.children);
      }
      return undefined;
    };
    return find(roots)?.children ?? [];
  }, [roots, selected]);

  if (!roots.length) return null;
  const crumbs = selected ? folderCrumbs(selected) : [];
  const current = crumbs.at(-1);

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border px-2 py-1.5">
      <div className="flex items-center gap-1 overflow-x-auto">
        {selected && (
          <button
            type="button"
            onClick={() => {
              tap();
              const up = crumbs.length > 1 ? crumbs[crumbs.length - 2].path : null;
              setFolderPath(up);
            }}
            className="flex h-8 shrink-0 items-center rounded-full border border-border px-2 text-text-dim"
            aria-label="Up one folder"
          >
            <ChevronLeft size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            tap();
            setFolderPath(null);
          }}
          className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs', selected === null ? 'border-accent/60 bg-accent/15 text-text' : 'border-border text-text-dim')}
        >
          <HardDrive size={12} /> All <span className="text-[10px] text-text-faint">{total}</span>
        </button>
        {crumbs.map((c, i) => (
          <button
            key={c.path}
            type="button"
            onClick={() => {
              tap();
              setFolderPath(c.path);
            }}
            className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs', i === crumbs.length - 1 ? 'border-accent/60 bg-accent/15 text-text' : 'border-border text-text-dim')}
          >
            <Folder size={12} /> <span className="max-w-[120px] truncate">{c.name}</span>
          </button>
        ))}
        {current && (
          <button type="button" onClick={() => actions.queue({ path: current.path, name: current.name, count: 0, total: 0, children: [] })} className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs text-text-dim" aria-label="Queue this folder">
            <ListPlus size={12} /> Queue
          </button>
        )}
      </div>
      {level.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto">
          {level.map((n) => (
            <motion.button
              key={n.path}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => {
                tap();
                setFolderPath(n.path);
              }}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-panel-3 px-3 text-xs text-text-dim"
            >
              <Folder size={12} className="text-text-faint" />
              <span className="max-w-[140px] truncate">{n.name}</span>
              <span className="text-[10px] text-text-faint">{n.total}</span>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
