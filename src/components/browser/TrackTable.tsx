import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'motion/react';
import { Music, Radio, ArrowUpDown, Layers } from 'lucide-react';
import { useStems } from '@/store/stems';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { isStreamTrack } from '@/services/tracks/TrackRef';
import { useLibrary } from '@/store/library';
import { useDecks } from '@/store/decks';
import { useUi } from '@/store/ui';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { formatTime } from '@/audio/dsp/math';
import { camelotCompatible } from '@/audio/dsp/key';
import { DND_MIME } from '@/services/tracks/registry';
import { deckColor } from '../deck/deckTheme';
import { DECK_IDS, type DeckId } from '@/audio/engine/types';
import { cn } from '@/ui/cn';
import { Skeleton } from '@/ui/Skeleton';

const COLS = 'grid-cols-[36px_minmax(180px,2fr)_minmax(120px,1.4fr)_64px_48px_56px_120px]';

export function TrackTable({ tracks, loading, emptyHint }: { tracks: TrackRef[]; loading?: boolean; emptyHint?: string }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const search = useLibrary((s) => s.search);
  const sortKey = useLibrary((s) => s.sortKey);
  const sortDir = useLibrary((s) => s.sortDir);
  const setSort = useLibrary((s) => s.setSort);
  const selected = useLibrary((s) => s.selectedTrackId);
  const select = useLibrary((s) => s.select);
  const focusedDeck = useUi((s) => s.focusedDeck);
  const layout = useUi((s) => s.layout);
  const decks = useDecks((s) => s.decks);
  const masterKey = decks[focusedDeck]?.key || '';
  const stemsReady = useStems((s) => s.ready);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = q ? tracks.filter((t) => `${t.meta.title} ${t.meta.artist} ${t.meta.album ?? ''} ${t.meta.genre ?? ''}`.toLowerCase().includes(q)) : tracks.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: TrackRef, b: TrackRef) => {
      const A = a.meta, B = b.meta;
      switch (sortKey) {
        case 'title': return A.title.localeCompare(B.title) * dir;
        case 'artist': return A.artist.localeCompare(B.artist) * dir;
        case 'bpm': return ((A.bpm ?? 0) - (B.bpm ?? 0)) * dir;
        case 'key': return (A.key ?? '').localeCompare(B.key ?? '', undefined, { numeric: true }) * dir;
        case 'duration': return ((A.durationSec ?? 0) - (B.durationSec ?? 0)) * dir;
        default: return ((A.addedAt ?? 0) - (B.addedAt ?? 0)) * dir;
      }
    };
    r = r.sort(cmp);
    return r;
  }, [tracks, search, sortKey, sortDir]);

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 34, overscan: 12 });

  const loadTo = (t: TrackRef, id: DeckId) => AudioEngine.deck(id).load(t);
  const loadedIds = new Set(Object.values(decks).map((d) => d.track?.meta.id).filter(Boolean));
  const visibleDecks = DECK_IDS.slice(0, layout);

  const Header = ({ k, label, className }: { k: typeof sortKey; label: string; className?: string }) => (
    <button type="button" onClick={() => setSort(k)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-semibold uppercase tracking-wider text-text-faint hover:text-text-dim', className)}>
      {label} {sortKey === k && <ArrowUpDown size={9} className="text-accent" />}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('grid items-center gap-2 border-b border-border px-3 py-1.5', COLS)}>
        <span />
        <Header k="title" label="Title" />
        <Header k="artist" label="Artist" />
        <Header k="bpm" label="BPM" className="justify-end" />
        <Header k="key" label="Key" className="justify-end" />
        <Header k="duration" label="Time" className="justify-end" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">Load</span>
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {loading && !rows.length && (
          <div className="flex flex-col gap-1 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        )}
        {!loading && !rows.length && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-text-faint">
            <Music size={26} />
            <div className="text-xs">{emptyHint ?? 'No tracks'}</div>
          </div>
        )}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const t = rows[vi.index];
            const stream = isStreamTrack(t);
            const isSel = selected === t.meta.id;
            const isLoaded = loadedIds.has(t.meta.id);
            const compat = !!(masterKey && t.meta.key && camelotCompatible(masterKey, t.meta.key));
            return (
              <div
                key={t.meta.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_MIME, t.meta.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => select(t.meta.id)}
                onDoubleClick={() => loadTo(t, focusedDeck)}
                className={cn('group absolute left-0 top-0 grid w-full cursor-grab items-center gap-2 px-3 text-xs active:cursor-grabbing', COLS, vi.index % 2 ? 'bg-white/[0.015]' : '', isSel ? 'bg-accent/10' : 'hover:bg-white/[0.04]')}
                style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
              >
                <div className="relative h-7 w-7 overflow-hidden rounded bg-panel-3">
                  {t.meta.artworkUrl ? <img src={t.meta.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} /> : <Music size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-text-faint" />}
                  {isLoaded && <span className="absolute inset-0 ring-2 ring-inset ring-accent/70" />}
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-text">{t.meta.title}</span>
                  {stream && <Radio size={10} className="shrink-0 text-warn" />}
                  {stemsReady[t.meta.id] && <Layers size={10} className="shrink-0 text-[#f472b6]" aria-label="Stems ready" />}
                </div>
                <span className="truncate text-text-dim">{t.meta.artist}</span>
                <span className="text-right font-mono tabular text-text-dim">{t.meta.bpm ? t.meta.bpm.toFixed(1) : '—'}</span>
                <span className={cn('rounded px-1 text-right font-mono tabular', compat ? 'bg-success/20 text-success' : 'text-text-dim')}>{t.meta.key || '—'}</span>
                <span className="text-right font-mono tabular text-text-dim">{t.meta.durationSec ? formatTime(t.meta.durationSec) : '—'}</span>
                <div className="flex items-center gap-1">
                  {visibleDecks.map((id) => (
                    <motion.button
                      key={id}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        loadTo(t, id);
                      }}
                      className="flex h-5 w-6 items-center justify-center rounded border border-border text-[10px] font-black opacity-60 hover:opacity-100 group-hover:opacity-100"
                      style={{ color: deckColor(id), borderColor: deckColor(id) + '66' }}
                      title={`Load to deck ${id}`}
                    >
                      {id}
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
