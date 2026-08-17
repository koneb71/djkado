import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'motion/react';
import { Music, Radio, ArrowUpDown, Layers, MoreHorizontal, ListPlus, Headphones, Loader2 } from 'lucide-react';
import { Prelisten, usePrelisten } from '@/audio/engine/Prelisten';
import { toast } from 'sonner';
import { useCrates } from '@/store/crates';
import { TrackMenu, type TrackMenuState } from './TrackMenu';
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
import { useIsMobile } from '@/mobile/useIsMobile';
import { useMobileUi } from '@/mobile/store';

const COLS = 'grid-cols-[36px_minmax(180px,2fr)_minmax(120px,1.4fr)_64px_48px_56px_178px]';
const COLS_MOBILE = 'grid-cols-[34px_minmax(0,1fr)_56px_104px]';

export function TrackTable({ tracks, loading, emptyHint, crateId }: { tracks: TrackRef[]; loading?: boolean; emptyHint?: string; crateId?: string }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<TrackMenuState | null>(null);
  const enqueue = useCrates((s) => s.enqueue);
  const queuedIds = useCrates((s) => s.queue);
  const queuedSet = useMemo(() => new Set(queuedIds.map((q) => q.trackId)), [queuedIds]);
  const pfl = usePrelisten();
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
  const mobile = useIsMobile();
  const setMobileTab = useMobileUi((s) => s.setTab);
  const cols = mobile ? COLS_MOBILE : COLS;

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

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => (mobile ? 52 : 34), overscan: 12 });

  const loadTo = (t: TrackRef, id: DeckId) => {
    void AudioEngine.deck(id).load(t);
    if (mobile) setMobileTab('decks');
  };
  const loadedIds = new Set(Object.values(decks).map((d) => d.track?.meta.id).filter(Boolean));
  const visibleDecks = DECK_IDS.slice(0, mobile ? 2 : layout);

  const Header = ({ k, label, className }: { k: typeof sortKey; label: string; className?: string }) => (
    <button type="button" onClick={() => setSort(k)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-semibold uppercase tracking-wider text-text-faint hover:text-text-dim', className)}>
      {label} {sortKey === k && <ArrowUpDown size={9} className="text-accent" />}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('grid items-center gap-2 border-b border-border px-3 py-1.5', cols)}>
        <span />
        <Header k="title" label={mobile ? 'Track' : 'Title'} />
        {!mobile && <Header k="artist" label="Artist" />}
        <Header k="bpm" label={mobile ? 'BPM · Key' : 'BPM'} className="justify-end" />
        {!mobile && <Header k="key" label="Key" className="justify-end" />}
        {!mobile && <Header k="duration" label="Time" className="justify-end" />}
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  select(t.meta.id);
                  setMenu({ track: t, x: e.clientX, y: e.clientY, crateId });
                }}
                className={cn('group absolute left-0 top-0 grid w-full cursor-grab items-center gap-2 px-3 text-xs active:cursor-grabbing', cols, vi.index % 2 ? 'bg-white/[0.015]' : '', isSel ? 'bg-accent/10' : 'hover:bg-white/[0.04]')}
                style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
              >
                <div className="relative h-7 w-7 overflow-hidden rounded bg-panel-3">
                  {t.meta.artworkUrl ? <img src={t.meta.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} /> : <Music size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-text-faint" />}
                  {isLoaded && <span className="absolute inset-0 ring-2 ring-inset ring-accent/70" />}
                  {pfl.trackId === t.meta.id && pfl.playing && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black/40">
                      <span className="block h-full bg-success" style={{ width: `${pfl.duration ? (pfl.position / pfl.duration) * 100 : 0}%` }} />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-text">{t.meta.title}</span>
                    {stream && <Radio size={10} className="shrink-0 text-warn" />}
                    {queuedSet.has(t.meta.id) && <span className="shrink-0 rounded bg-accent/20 px-1 text-[8px] font-bold uppercase text-accent">Q</span>}
                    {stemsReady[t.meta.id] && <Layers size={10} className="shrink-0 text-[#f472b6]" aria-label="Stems ready" />}
                  </div>
                  {mobile && <div className="truncate text-[11px] text-text-dim">{t.meta.artist}{t.meta.durationSec ? ` · ${formatTime(t.meta.durationSec)}` : ''}</div>}
                </div>
                {!mobile && <span className="truncate text-text-dim">{t.meta.artist}</span>}
                {mobile ? (
                  <div className="text-right font-mono text-[11px] leading-tight tabular text-text-dim">
                    <div>{t.meta.bpm ? t.meta.bpm.toFixed(1) : '—'}</div>
                    <div className={cn('inline-block rounded px-1', compat ? 'bg-success/20 text-success' : '')}>{t.meta.key || '—'}</div>
                  </div>
                ) : (
                  <>
                    <span className="text-right font-mono tabular text-text-dim">{t.meta.bpm ? t.meta.bpm.toFixed(1) : '—'}</span>
                    <span className={cn('rounded px-1 text-right font-mono tabular', compat ? 'bg-success/20 text-success' : 'text-text-dim')}>{t.meta.key || '—'}</span>
                    <span className="text-right font-mono tabular text-text-dim">{t.meta.durationSec ? formatTime(t.meta.durationSec) : '—'}</span>
                  </>
                )}
                <div className="flex items-center gap-1">
                  {!stream && !mobile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void Prelisten.toggle(t);
                      }}
                      onWheel={(e) => {
                        // scrub while pre-listening
                        if (pfl.trackId === t.meta.id && pfl.playing && pfl.duration) Prelisten.seek((pfl.position + (e.deltaY > 0 ? 10 : -10)) / pfl.duration);
                      }}
                      className={cn('flex items-center justify-center rounded border font-black opacity-60 hover:opacity-100 group-hover:opacity-100', mobile ? 'h-9 w-8 opacity-100' : 'h-5 w-6', pfl.trackId === t.meta.id && (pfl.playing || pfl.loading) ? 'border-success/60 bg-success/15 text-success opacity-100' : 'border-border text-text-dim')}
                      title="Pre-listen in headphones (PFL)"
                      aria-label="Pre-listen"
                    >
                      {pfl.trackId === t.meta.id && pfl.loading ? <Loader2 size={12} className="animate-spin" /> : <Headphones size={mobile ? 14 : 12} />}
                    </button>
                  )}
                  {visibleDecks.map((id) => (
                    <motion.button
                      key={id}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        loadTo(t, id);
                      }}
                      className={cn('flex items-center justify-center rounded border border-border font-black opacity-60 hover:opacity-100 group-hover:opacity-100', mobile ? 'h-9 w-8 text-xs opacity-100' : 'h-5 w-6 text-[10px]')}
                      style={{ color: deckColor(id), borderColor: deckColor(id) + '66' }}
                      title={`Load to deck ${id}`}
                    >
                      {id}
                    </motion.button>
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      enqueue([t]);
                      toast.success('Added to queue', { duration: 1200 });
                    }}
                    className={cn('flex items-center justify-center rounded border border-border text-text-dim opacity-60 hover:opacity-100 hover:text-text group-hover:opacity-100', mobile ? 'h-9 w-8 opacity-100' : 'h-5 w-6')}
                    title="Add to queue"
                    aria-label="Add to queue"
                  >
                    <ListPlus size={mobile ? 14 : 12} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenu({ track: t, x: r.right - 230, y: r.bottom + 4, crateId });
                    }}
                    className={cn('flex items-center justify-center rounded border border-border text-text-dim opacity-60 hover:opacity-100 hover:text-text group-hover:opacity-100', mobile ? 'h-9 w-7 opacity-100' : 'h-5 w-5')}
                    title="More"
                    aria-label="Track menu"
                  >
                    <MoreHorizontal size={mobile ? 14 : 12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <TrackMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
