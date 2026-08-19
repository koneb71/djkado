import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FolderOpen, FilePlus2, HardDrive, History, ListMusic, Search, X, Loader2, Box, ListOrdered, Music4 } from 'lucide-react';
import { useCrates } from '@/store/crates';
import { hasNativeFiles } from '@/mobile/nativeFiles';
import { useAutomix } from '@/store/automix';
import { CratesView } from './CratesView';
import { FolderBar, FolderTree } from './FolderBrowser';
import { tracksInFolder } from '@/services/localLibrary/folders';
import { QueueView } from './QueueView';
import { useLibrary, type SourceId } from '@/store/library';
import { LocalLibrary } from '@/services/localLibrary/LocalLibrary';
import { getSource, useSource } from '@/services/sources';
import { getHistory } from '@/services/localLibrary/db';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { TrackTable } from './TrackTable';
import { ConnectCard } from './ConnectCard';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { useIsMobile } from '@/mobile/useIsMobile';

/** Pick a folder and jump straight to it in the browser. */
async function addFolderAndSelect() {
  const added = await LocalLibrary.pickFolder();
  const folder = added.find((t) => t.meta.folder)?.meta.folder;
  if (!folder) return;
  useLibrary.getState().setFolderPath(folder.split('/')[0]);
}

const TABS: { id: SourceId; label: string; icon: React.ReactNode }[] = [
  { id: 'local', label: 'Local', icon: <HardDrive size={12} /> },
  { id: 'spotify', label: 'Spotify', icon: <span className="h-2 w-2 rounded-full bg-[#1DB954]" /> },
  { id: 'apple', label: 'Apple Music', icon: <span className="h-2 w-2 rounded-full bg-[#fa2d48]" /> },
  { id: 'history', label: 'History', icon: <History size={12} /> },
  { id: 'crates', label: 'Crates', icon: <Box size={12} /> },
  { id: 'queue', label: 'Queue', icon: <ListOrdered size={12} /> },
];

export function LibraryBrowser() {
  const source = useLibrary((s) => s.source);
  const setSource = useLibrary((s) => s.setSource);
  const search = useLibrary((s) => s.search);
  const setSearch = useLibrary((s) => s.setSearch);
  const scanning = useLibrary((s) => s.scanning);
  const queueLen = useCrates((s) => s.queue.length);
  const localCount = useLibrary((s) => s.localTracks.length);
  const automixOn = useAutomix((s) => s.enabled);
  const mobile = useIsMobile();
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // keep the active tab visible in the horizontally scrolling strip on phones
    if (!mobile) return;
    tabsRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [source, mobile]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex items-center gap-2 border-b border-border px-2 py-1.5', mobile ? 'overflow-x-auto' : 'flex-wrap')}>
        <div ref={tabsRef} className="flex shrink-0 items-center gap-0.5 rounded-md bg-bg-elev p-0.5">
          {TABS.map((t) => (
            <button key={t.id} type="button" data-active={source === t.id} onClick={() => setSource(t.id)} className={cn('relative flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold', source === t.id ? 'text-text' : 'text-text-faint hover:text-text-dim')}>
              {source === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded bg-panel-3" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <span className="relative flex items-center gap-1.5">
                {t.icon} {mobile && (t.id === 'apple' ? 'Apple' : t.label) || t.label}
                {t.id === 'queue' && queueLen > 0 && <span className={cn('rounded-full px-1.5 font-mono text-[9px] leading-4', automixOn ? 'bg-accent text-bg' : 'bg-panel-3 text-text-dim')}>{queueLen}</span>}
              </span>
            </button>
          ))}
        </div>
        {source !== 'queue' && (
        <div className="relative ml-1 min-w-[160px] flex-1 max-w-sm">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={source === 'local' || source === 'history' || source === 'crates' ? 'Filter tracks…' : `Search ${source === 'spotify' ? 'Spotify' : 'Apple Music'}…`}
            className="h-7 w-full rounded-md border border-border bg-bg-elev pl-7 pr-7 text-xs text-text placeholder:text-text-faint outline-none focus:border-accent"
            onKeyDown={(e) => e.stopPropagation()}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text" aria-label="Clear">
              <X size={12} />
            </button>
          )}
        </div>
        )}
        <div className="flex-1" />
        {scanning.active && (
          <span className="flex items-center gap-1 text-[10px] text-text-dim">
            <Loader2 size={11} className="animate-spin" /> Reading tags {scanning.done}/{scanning.total}
          </span>
        )}
        {source === 'local' && !mobile && (
          <>
            <Button size="xs" onClick={() => void LocalLibrary.pickFiles()}>
              <FilePlus2 size={12} /> Add files
            </Button>
            <Button size="xs" onClick={() => void addFolderAndSelect()}>
              <FolderOpen size={12} /> Add folder
            </Button>
          </>
        )}
      </div>
      {source === 'local' && mobile && localCount > 0 && <AddMusicRow />}
      {source === 'local' && <LocalView />}
      {source === 'history' && <HistoryView />}
      {source === 'crates' && <CratesView />}
      {source === 'queue' && <QueueView />}
      {(source === 'spotify' || source === 'apple') && <StreamView id={source} />}
    </div>
  );
}

/** Phones: always-visible, thumb-sized library actions (the header strip scrolls horizontally). */
function AddMusicRow() {
  const scanning = useLibrary((s) => s.scanning);
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
      <Button size="sm" className="flex-1" onClick={() => void addFolderAndSelect()}>
        <FolderOpen size={14} /> Add folder
      </Button>
      <Button size="sm" className="flex-1" onClick={() => void LocalLibrary.pickFiles()}>
        <FilePlus2 size={14} /> Add files
      </Button>
      {scanning.active && (
        <span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-text-dim">
          <Loader2 size={11} className="animate-spin" /> {scanning.done}/{scanning.total}
        </span>
      )}
    </div>
  );
}

/** Can this platform re-open a folder on the next launch? (SAF on Android, FS Access elsewhere) */
const foldersPersist = () => hasNativeFiles() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);

function LocalView() {
  const tracks = useLibrary((s) => s.localTracks);
  const folderPath = useLibrary((s) => s.folderPath);
  const mobile = useIsMobile();
  const search = useLibrary((s) => s.search.trim());
  const shown = useMemo(() => tracksInFolder(tracks, folderPath), [tracks, folderPath]);
  const emptyHint = search ? `No tracks match “${search}”${folderPath ? ' in this folder' : ''}.` : 'This folder is empty.';
  if (!tracks.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Music4 size={28} className="text-text-faint" />
        <div className="text-xs text-text-dim">Your library is empty</div>
        <div className="max-w-[280px] text-[11px] text-text-faint">
          {foldersPersist()
            ? 'Add a folder of music — DJKado keeps access to it, so your library is still here next time you open the app.'
            : 'Drop audio files or folders anywhere. This browser can’t re-open them next visit — Chrome, Edge, the desktop app or the Android app can.'}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void addFolderAndSelect()}>
            <FolderOpen size={14} /> Add folder
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void LocalLibrary.pickFiles()}>
            <FilePlus2 size={14} /> Add files
          </Button>
        </div>
      </div>
    );
  }
  if (mobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FolderBar tracks={tracks} />
        <TrackTable tracks={shown} emptyHint={emptyHint} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1">
      <FolderTree tracks={tracks} />
      <TrackTable tracks={shown} emptyHint={emptyHint} />
    </div>
  );
}

function HistoryView() {
  const [tracks, setTracks] = useState<TrackRef[]>([]);
  const local = useLibrary((s) => s.localTracks);
  useEffect(() => {
    getHistory().then((h) => {
      const seen = new Set<string>();
      const out: TrackRef[] = [];
      for (const e of h) {
        if (seen.has(e.trackId)) continue;
        seen.add(e.trackId);
        const t = local.find((x) => x.meta.id === e.trackId);
        if (t) out.push({ ...t, meta: { ...t.meta, addedAt: e.playedAt } } as TrackRef);
      }
      setTracks(out);
    });
  }, [local]);
  return <TrackTable tracks={tracks} emptyHint="Tracks you load into a deck show up here." />;
}

function StreamView({ id }: { id: 'spotify' | 'apple' }) {
  const { status } = useSource(id);
  const src = getSource(id);
  const search = useLibrary((s) => s.search);
  const selected = useLibrary((s) => s.selectedPlaylist[id]);
  const selectPlaylist = useLibrary((s) => s.selectPlaylist);
  const setPlaylistTracks = useLibrary((s) => s.setPlaylistTracks);
  const ready = status === 'ready';

  const playlists = useQuery({ queryKey: ['playlists', id, src.mock], queryFn: () => src.getPlaylists(), enabled: ready });
  useEffect(() => {
    if (ready && !selected && playlists.data?.[0]) selectPlaylist(id, playlists.data[0].id);
  }, [ready, selected, playlists.data, id, selectPlaylist]);

  const q = search.trim();
  const tracksQ = useQuery({
    queryKey: ['tracks', id, q || selected],
    queryFn: async () => {
      const t = q.length >= 2 ? await src.search(q) : selected ? await src.getPlaylistTracks(selected) : [];
      setPlaylistTracks(`${id}:${q || selected}`, t);
      return t;
    },
    enabled: ready && (!!selected || q.length >= 2),
  });

  const rows = useMemo(() => tracksQ.data ?? [], [tracksQ.data]);
  const mobile = useIsMobile();

  if (!ready) return <ConnectCard id={id} />;
  if (mobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ConnectCard id={id} />
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5">
          {playlists.data?.map((p) => (
            <button key={p.id} type="button" onClick={() => selectPlaylist(id, p.id)} className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs', selected === p.id && !q ? 'border-accent/60 bg-accent/15 text-text' : 'border-border text-text-dim')}>
              {p.artworkUrl ? <img src={p.artworkUrl} alt="" className="h-4 w-4 rounded object-cover" /> : <ListMusic size={12} className="text-text-faint" />}
              <span className="max-w-[140px] truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <TrackTable tracks={rows} loading={tracksQ.isLoading} emptyHint={q ? 'No results' : 'Select a playlist'} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConnectCard id={id} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-48 shrink-0 overflow-auto border-r border-border p-1.5">
          <div className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-widest text-text-faint">Playlists</div>
          {playlists.isLoading && <div className="px-2 text-xs text-text-faint">Loading…</div>}
          {playlists.data?.map((p) => (
            <button key={p.id} type="button" onClick={() => selectPlaylist(id, p.id)} className={cn('flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs', selected === p.id && !q ? 'bg-panel-3 text-text' : 'text-text-dim hover:bg-white/[0.04]')}>
              {p.artworkUrl ? <img src={p.artworkUrl} alt="" className="h-5 w-5 rounded object-cover" /> : <ListMusic size={13} className="text-text-faint" />}
              <span className="truncate">{p.name}</span>
              {p.trackCount !== undefined && <span className="ml-auto text-[10px] text-text-faint">{p.trackCount}</span>}
            </button>
          ))}
        </aside>
        <TrackTable tracks={rows} loading={tracksQ.isLoading} emptyHint={q ? 'No results' : 'Select a playlist'} />
      </div>
    </div>
  );
}
