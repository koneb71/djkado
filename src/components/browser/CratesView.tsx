import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Box, Plus, Trash2, Pencil, ListPlus, Check, X } from 'lucide-react';
import { useCrates } from '@/store/crates';
import { useLibrary } from '@/store/library';
import { findTrack } from '@/services/tracks/registry';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { DND_MIME } from '@/services/tracks/registry';
import { TrackTable } from './TrackTable';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { useIsMobile } from '@/mobile/useIsMobile';

/** Crates = user playlists. Left: crate list; right: the crate's tracks (missing files are listed but greyed in the count). */
export function CratesView() {
  const crates = useCrates((s) => s.crates);
  const selectedId = useCrates((s) => s.selectedCrateId);
  const selectCrate = useCrates((s) => s.selectCrate);
  const createCrate = useCrates((s) => s.createCrate);
  const renameCrate = useCrates((s) => s.renameCrate);
  const deleteCrate = useCrates((s) => s.deleteCrate);
  const addToCrate = useCrates((s) => s.addToCrate);
  const enqueue = useCrates((s) => s.enqueue);
  const metaById = useCrates((s) => s.metaById);
  const local = useLibrary((s) => s.localTracks);
  const playlistTracks = useLibrary((s) => s.playlistTracks);
  const mobile = useIsMobile();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const crate = crates.find((c) => c.id === selectedId) ?? crates[0] ?? null;

  const { tracks, missing } = useMemo(() => {
    if (!crate) return { tracks: [] as TrackRef[], missing: 0 };
    const out: TrackRef[] = [];
    let missing = 0;
    for (const id of crate.trackIds) {
      const t = findTrack(id);
      if (t) out.push(t);
      else missing++;
    }
    return { tracks: out, missing };
    // findTrack reads the library store; depend on its slices so the memo refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crate, local, playlistTracks, metaById]);

  const onDrop = (e: React.DragEvent, crateId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DND_MIME);
    const t = id && findTrack(id);
    if (t) {
      addToCrate(crateId, [t]);
      toast.success('Added to crate', { duration: 1200 });
    }
  };

  const list = (
    <div className={cn('flex flex-col', mobile ? 'shrink-0 border-b border-border' : 'w-52 shrink-0 overflow-auto border-r border-border')}>
      <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-text-faint">Crates</span>
        <button type="button" onClick={() => { setCreating(true); setDraft(''); }} className="flex h-6 w-6 items-center justify-center rounded text-text-dim hover:bg-white/[0.06] hover:text-text" aria-label="New crate">
          <Plus size={13} />
        </button>
      </div>
      {creating && (
        <form
          className="flex items-center gap-1 px-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) createCrate(draft);
            setCreating(false);
          }}
        >
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Crate name" className="h-7 min-w-0 flex-1 rounded border border-border bg-bg-elev px-2 text-xs outline-none focus:border-accent" />
          <button type="submit" className="text-success" aria-label="Create"><Check size={14} /></button>
          <button type="button" onClick={() => setCreating(false)} className="text-text-faint" aria-label="Cancel"><X size={14} /></button>
        </form>
      )}
      <div className={cn(mobile ? 'flex gap-1.5 overflow-x-auto px-2 pb-2' : 'flex flex-col px-1.5 pb-2')}>
        {crates.length === 0 && !creating && <div className="px-2 py-2 text-[11px] text-text-faint">No crates yet — right-click a track (or “⋯”) → Add to crate.</div>}
        {crates.map((c) => {
          const active = crate?.id === c.id;
          return (
            <div
              key={c.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, c.id)}
              className={cn('group flex items-center gap-1.5 rounded text-left text-xs', mobile ? 'h-8 shrink-0 border px-3' : 'px-1.5 py-1', active ? (mobile ? 'border-accent/60 bg-accent/15 text-text' : 'bg-panel-3 text-text') : mobile ? 'border-border text-text-dim' : 'text-text-dim hover:bg-white/[0.04]')}
            >
              {editing === c.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameCrate(c.id, draft);
                    setEditing(null);
                  }}
                >
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} onBlur={() => setEditing(null)} className="h-6 min-w-0 flex-1 rounded border border-border bg-bg-elev px-1.5 text-xs outline-none focus:border-accent" />
                </form>
              ) : (
                <button type="button" onClick={() => selectCrate(c.id)} onDoubleClick={() => { setEditing(c.id); setDraft(c.name); }} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Box size={12} className="shrink-0 text-text-faint" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto pl-2 text-[10px] text-text-faint">{c.trackIds.length}</span>
                </button>
              )}
              {!mobile && editing !== c.id && (
                <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button type="button" onClick={() => { setEditing(c.id); setDraft(c.name); }} className="text-text-faint hover:text-text" aria-label="Rename"><Pencil size={11} /></button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete crate “${c.name}”?`)) deleteCrate(c.id);
                    }}
                    className="text-text-faint hover:text-danger"
                    aria-label="Delete crate"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn('flex min-h-0 flex-1', mobile ? 'flex-col' : '')}>
      {list}
      <div className="flex min-h-0 flex-1 flex-col">
        {crate && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-1">
            <span className="truncate text-xs font-semibold">{crate.name}</span>
            <span className="text-[10px] text-text-faint">
              {tracks.length} track{tracks.length === 1 ? '' : 's'}
              {missing > 0 && <span className="text-warn"> · {missing} missing (re-add the files)</span>}
            </span>
            <div className="flex-1" />
            <Button size="xs" disabled={!tracks.length} onClick={() => { enqueue(tracks); toast.success(`Queued ${tracks.length} tracks`); }}>
              <ListPlus size={12} /> Queue all
            </Button>
            {mobile && (
              <Button size="xs" variant="ghost" onClick={() => { if (window.confirm(`Delete crate “${crate.name}”?`)) deleteCrate(crate.id); }} aria-label="Delete crate">
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        )}
        <TrackTable tracks={tracks} crateId={crate?.id} emptyHint={crate ? 'Empty crate — drag tracks here or use the row menu → Add to crate.' : 'Create a crate to start organising your sets.'} />
      </div>
    </div>
  );
}
