import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Disc3, ArrowUpFromLine as Eject, Music } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { deckRuntime, interpolatePos } from '@/store/runtime';
import { addFrameCallback } from '@/hooks/useAnimationFrame';
import { formatTime } from '@/audio/dsp/math';
import { shiftCamelot } from '@/audio/dsp/key';
import { deckColor } from './deckTheme';
import { StreamBadge } from './StreamBadge';
import { Tooltip } from '@/ui/Tooltip';
import { isStreamTrack } from '@/services/tracks/TrackRef';
import { cn } from '@/ui/cn';

export function DeckHeader({ id, compact }: { id: DeckId; compact?: boolean }) {
  const d = useDeck(id);
  const color = deckColor(id);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const remainRef = useRef<HTMLSpanElement>(null);
  const [showRemain, setShowRemain] = useState(true);

  useEffect(() => {
    return addFrameCallback(() => {
      const rt = deckRuntime[id].get();
      const pos = interpolatePos(rt, AudioEngine.ctx.currentTime);
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(pos, false);
      if (remainRef.current) remainRef.current.textContent = '-' + formatTime(Math.max(0, (AudioEngine.deck(id).duration || 0) - pos), false);
    });
  }, [id]);

  const bpmDisplay = d.bpm ? (d.bpm * d.rate).toFixed(2) : '--.--';
  const pitchPct = ((d.rate - 1) * 100).toFixed(2);

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={d.track?.meta.id ?? 'empty'}
            initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className={cn('flex items-center justify-center overflow-hidden rounded-md bg-panel-3', compact ? 'h-9 w-9' : 'h-12 w-12')}
            style={{ boxShadow: `0 0 0 1px ${color}44` }}
          >
            {d.track?.meta.artworkUrl ? <img src={d.track.meta.artworkUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <Music size={compact ? 14 : 18} className="text-text-faint" />}
          </motion.div>
        </AnimatePresence>
        <div className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-black text-bg" style={{ background: color }}>
          {id}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={d.track?.meta.id ?? 'empty'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="min-w-0">
            {d.track ? (
              <>
                <div className="flex items-center gap-2">
                  <div className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>{d.track.meta.title}</div>
                  {isStreamTrack(d.track) && <StreamBadge />}
                </div>
                <div className="truncate text-[11px] text-text-dim">{d.track.meta.artist}</div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-text-faint">
                <Disc3 size={14} />
                <span className="text-xs">Drop a track or double-click one in the library</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-3 font-mono tabular">
        <div className="text-right leading-tight">
          <div className={cn('font-bold', compact ? 'text-sm' : 'text-lg')} style={{ color }}>
            {bpmDisplay}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-faint">
            BPM {d.bpm ? <span className={cn(d.rate !== 1 && 'text-text-dim')}>{d.rate === 1 ? '' : `${Number(pitchPct) > 0 ? '+' : ''}${pitchPct}%`}</span> : ''}
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className={cn('flex items-center justify-end gap-1 font-bold', compact ? 'text-sm' : 'text-lg')}>
            {d.keylock && !compact && (
              <button type="button" className="rounded px-1 text-[10px] text-text-faint hover:bg-panel-3 hover:text-text" onClick={() => AudioEngine.deck(id).setKeyShift(d.keyShift - 1)} aria-label="Key down" title="Key shift −1 semitone">
                −
              </button>
            )}
            <span className={cn(d.keyShift !== 0 && 'text-accent')}>{d.key ? shiftCamelot(d.key, d.keyShift) : '--'}</span>
            {d.keylock && !compact && (
              <button type="button" className="rounded px-1 text-[10px] text-text-faint hover:bg-panel-3 hover:text-text" onClick={() => AudioEngine.deck(id).setKeyShift(d.keyShift + 1)} aria-label="Key up" title="Key shift +1 semitone">
                +
              </button>
            )}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-faint">Key{d.keyShift ? ` ${d.keyShift > 0 ? '+' : ''}${d.keyShift}` : ''}</div>
        </div>
        <Tooltip label={showRemain ? 'Show elapsed' : 'Show remaining'}>
          <button type="button" className="text-right leading-tight" onClick={() => setShowRemain((v) => !v)}>
            <div className={cn('font-bold', compact ? 'text-sm' : 'text-lg')}>
              <span ref={elapsedRef} className={cn(showRemain && 'hidden')}>
                00:00
              </span>
              <span ref={remainRef} className={cn(!showRemain && 'hidden')}>
                -00:00
              </span>
            </div>
            <div className="text-[9px] uppercase tracking-widest text-text-faint">{showRemain ? 'Remain' : 'Elapsed'}</div>
          </button>
        </Tooltip>
        {d.track && (
          <Tooltip label="Eject">
            <button type="button" onClick={() => AudioEngine.deck(id).eject()} className="rounded p-1 text-text-faint hover:bg-panel-3 hover:text-text" aria-label="Eject">
              <Eject size={14} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
