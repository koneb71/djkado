import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Music, ChevronUp, ChevronDown, X, Shuffle, Trash2, ListMusic, AlertTriangle, GripVertical } from 'lucide-react';
import { useCrates } from '@/store/crates';
import { useLibrary } from '@/store/library';
import { useUi } from '@/store/ui';
import { findTrack, DND_MIME } from '@/services/tracks/registry';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { DECK_IDS, type DeckId } from '@/audio/engine/types';
import { formatTime } from '@/audio/dsp/math';
import { deckColor } from '../deck/deckTheme';
import { AutomixBar } from './AutomixBar';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { useIsMobile } from '@/mobile/useIsMobile';
import { useMobileUi } from '@/mobile/store';
import { tap } from '@/mobile/native';

/** Ordered play queue: Auto DJ pulls from the top; you can reorder, remove, or load any entry manually. */
export function QueueView() {
  const queue = useCrates((s) => s.queue);
  const dequeue = useCrates((s) => s.dequeue);
  const moveInQueue = useCrates((s) => s.moveInQueue);
  const clearQueue = useCrates((s) => s.clearQueue);
  const shuffleQueue = useCrates((s) => s.shuffleQueue);
  const enqueue = useCrates((s) => s.enqueue);
  // subscribe to the library so "missing" flags update when files are (re)added
  useLibrary((s) => s.localTracks.length);
  const layout = useUi((s) => s.layout);
  const mobile = useIsMobile();
  const setMobileTab = useMobileUi((s) => s.setTab);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const visibleDecks = DECK_IDS.slice(0, mobile ? 2 : layout);

  const total = queue.reduce((a, q) => a + (q.meta.durationSec ?? 0), 0);

  const onDropExternal = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(DND_MIME);
    if (!id) return;
    e.preventDefault();
    const t = findTrack(id);
    if (t) {
      enqueue([t]);
      toast.success('Added to queue', { duration: 1200 });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_MIME)) e.preventDefault(); }} onDrop={onDropExternal}>
      <AutomixBar compact={mobile} />
      <div className="flex items-center gap-2 border-b border-border px-3 py-1">
        <ListMusic size={12} className="text-text-faint" />
        <span className="text-[10px] text-text-faint">
          {queue.length} track{queue.length === 1 ? '' : 's'}
          {total > 0 && ` · ${formatTime(total)}`}
        </span>
        <div className="flex-1" />
        <Button size="xs" variant="ghost" disabled={queue.length < 2} onClick={shuffleQueue}>
          <Shuffle size={12} /> Shuffle
        </Button>
        <Button size="xs" variant="ghost" disabled={!queue.length} onClick={() => { if (window.confirm('Clear the queue?')) clearQueue(); }}>
          <Trash2 size={12} /> Clear
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {queue.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-text-faint">
            <ListMusic size={26} />
            <div className="text-xs">Queue is empty — use the “+” on any track, right-click → Add to queue, or drag tracks here.</div>
            <div className="text-[11px]">Turn on Auto DJ and it plays the queue on decks A/B with beat-matched transitions.</div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {queue.map((q, i) => {
            const t = findTrack(q.trackId);
            const missing = !t;
            return (
              <motion.div
                key={q.uid}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.16 }}
                draggable={!mobile}
                onDragStart={(e) => {
                  setDragIdx(i);
                  (e as unknown as React.DragEvent).dataTransfer?.setData('text/x-djkado-queue', String(i));
                }}
                onDragOver={(e) => {
                  if (dragIdx === null) return;
                  e.preventDefault();
                  setOverIdx(i);
                }}
                onDrop={(e) => {
                  if (dragIdx === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  moveInQueue(dragIdx, i);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                className={cn('group flex items-center gap-2 border-b border-border/60 px-2 text-xs', mobile ? 'h-14' : 'h-10', i === 0 ? 'bg-accent/[0.06]' : 'hover:bg-white/[0.03]', overIdx === i && dragIdx !== i && 'border-t-2 border-t-accent', missing && 'opacity-60')}
              >
                {!mobile && <GripVertical size={12} className="cursor-grab text-text-faint opacity-0 group-hover:opacity-100" />}
                <span className={cn('w-5 shrink-0 text-center font-mono text-[10px]', i === 0 ? 'font-bold text-accent' : 'text-text-faint')}>{i + 1}</span>
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded bg-panel-3">
                  {q.meta.artworkUrl ? <img src={q.meta.artworkUrl} alt="" className="h-full w-full object-cover" /> : <Music size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-text-faint" />}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-text">{q.meta.title}</span>
                    {i === 0 && <span className="shrink-0 rounded bg-accent/20 px-1 text-[8px] font-bold uppercase text-accent">Next</span>}
                    {missing && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[9px] uppercase text-warn" title="File not in the library — re-add it">
                        <AlertTriangle size={9} /> missing
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-text-dim">
                    {q.meta.artist}
                    {q.meta.bpm ? ` · ${q.meta.bpm.toFixed(0)} BPM` : ''}
                    {q.meta.key ? ` · ${q.meta.key}` : ''}
                    {q.meta.durationSec ? ` · ${formatTime(q.meta.durationSec)}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {visibleDecks.map((id: DeckId) => (
                    <button
                      key={id}
                      type="button"
                      disabled={missing}
                      onClick={() => {
                        if (!t) return;
                        tap();
                        void AudioEngine.deck(id).load(t);
                        dequeue(q.uid);
                        if (mobile) setMobileTab('decks');
                      }}
                      className={cn('flex items-center justify-center rounded border font-black opacity-70 hover:opacity-100 disabled:opacity-30', mobile ? 'h-9 w-8 text-xs opacity-100' : 'h-5 w-6 text-[10px]')}
                      style={{ color: deckColor(id), borderColor: deckColor(id) + '66' }}
                      title={`Load to deck ${id} (removes from queue)`}
                    >
                      {id}
                    </button>
                  ))}
                  <button type="button" disabled={i === 0} onClick={() => moveInQueue(i, i - 1)} className={cn('flex items-center justify-center rounded text-text-faint hover:text-text disabled:opacity-20', mobile ? 'h-9 w-7' : 'h-5 w-5')} aria-label="Move up">
                    <ChevronUp size={13} />
                  </button>
                  <button type="button" disabled={i === queue.length - 1} onClick={() => moveInQueue(i, i + 1)} className={cn('flex items-center justify-center rounded text-text-faint hover:text-text disabled:opacity-20', mobile ? 'h-9 w-7' : 'h-5 w-5')} aria-label="Move down">
                    <ChevronDown size={13} />
                  </button>
                  <button type="button" onClick={() => dequeue(q.uid)} className={cn('flex items-center justify-center rounded text-text-faint hover:text-danger', mobile ? 'h-9 w-7' : 'h-5 w-5')} aria-label="Remove from queue">
                    <X size={13} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
