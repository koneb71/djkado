import { motion } from 'motion/react';
import type { DeckId } from '@/audio/engine/types';
import { HOT_CUE_COLORS } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { formatTime } from '@/audio/dsp/math';
import { cn } from '@/ui/cn';

/** 8 hot-cue pads. Click: set / jump. Shift+click or right-click: delete. Hold on paused deck: preview. */
export function HotCues({ id, compact }: { id: DeckId; compact?: boolean }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const disabled = !d.track || !d.capabilities.hotCues;
  return (
    <div className={cn('grid gap-1', compact ? 'grid-cols-8' : 'grid-cols-4')}>
      {d.hotCues.map((c, i) => {
        const color = c?.color ?? HOT_CUE_COLORS[i];
        const set = !!c;
        return (
          <motion.button
            key={i}
            type="button"
            disabled={disabled}
            whileTap={{ scale: 0.93 }}
            className={cn('relative flex flex-col items-start justify-between rounded-md border px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40', compact ? 'h-7' : 'h-10', set ? 'border-transparent' : 'border-border bg-panel-2 hover:border-border-2')}
            style={set ? { background: `linear-gradient(180deg, ${color}dd, ${color}99)`, boxShadow: `0 0 12px ${color}55, inset 0 1px 0 rgba(255,255,255,0.25)`, color: '#0b0d10' } : undefined}
            onPointerDown={(e) => {
              if (e.button === 2) return;
              e.preventDefault();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              if (e.shiftKey) dk.hotCueDelete(i);
              else dk.hotCuePress(i);
            }}
            onPointerUp={() => dk.hotCueRelease(i)}
            onPointerCancel={() => dk.hotCueRelease(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              dk.hotCueDelete(i);
            }}
            aria-label={`Hot cue ${i + 1}`}
          >
            <span className={cn('font-black leading-none', compact ? 'text-[10px]' : 'text-xs', !set && 'text-text-faint')} style={!set ? { color: color + 'aa' } : undefined}>
              {i + 1}
            </span>
            {!compact && <span className={cn('font-mono text-[9px] leading-none', set ? 'text-bg/80' : 'text-text-faint')}>{set ? (c!.type === 'loop' ? '⟳ ' : '') + formatTime(c!.sec) : '—'}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
