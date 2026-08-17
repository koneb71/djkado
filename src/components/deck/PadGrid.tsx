import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { DeckId } from '@/audio/engine/types';
import { HOT_CUE_COLORS } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { PAD_MODES, useUi } from '@/store/ui';
import { formatTime } from '@/audio/dsp/math';
import { addFrameCallback } from '@/hooks/useAnimationFrame';
import { deckColor } from './deckTheme';
import { tap } from '@/mobile/native';
import { cn } from '@/ui/cn';
import { ROLL_SIZES, JUMP_SIZES, ROLL_SIZES_4, JUMP_SIZES_4 } from './padSizes';

const fmtBeats = (b: number) => (b < 1 ? `1/${Math.round(1 / b)}` : String(b));

/**
 * Performance pad grid: Hot cue / Loop roll / Slicer / Beat jump modes on the same 8 (or 4) pads.
 * Press/release semantics are momentary for roll & slicer (like hardware pads).
 */
export function PadGrid({ id, compact, count = 8, mobile }: { id: DeckId; compact?: boolean; count?: 4 | 8; mobile?: boolean }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const color = deckColor(id);
  const mode = useUi((s) => s.padMode[id]);
  const setPadMode = useUi((s) => s.setPadMode);
  const disabled = !d.track;
  const rollSizes = count === 4 ? ROLL_SIZES_4 : ROLL_SIZES;
  const jumpSizes = count === 4 ? JUMP_SIZES_4 : JUMP_SIZES;
  const padRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // slicer: light the pad the playhead is currently in (rAF, no React re-render)
  useEffect(() => {
    if (mode !== 'slicer') return;
    return addFrameCallback(() => {
      const cur = dk.currentSlice(count);
      padRefs.current.forEach((el, i) => {
        if (!el) return;
        el.style.boxShadow = i === cur ? `0 0 0 2px ${color}, 0 0 14px ${color}88` : '';
      });
    });
  }, [mode, dk, color, count]);

  const padLabel = (i: number): { top: string; sub: string; bg?: string; fg?: string; set: boolean } => {
    switch (mode) {
      case 'roll':
        return { top: fmtBeats(rollSizes[i]), sub: 'roll', set: true, bg: `${color}22`, fg: color };
      case 'slicer':
        return { top: String(i + 1), sub: 'slice', set: true, bg: `${color}22`, fg: color };
      case 'beatjump': {
        const n = jumpSizes[i];
        return { top: `${n > 0 ? '+' : ''}${n}`, sub: 'beats', set: true, bg: n < 0 ? '#f9731622' : '#22c55e22', fg: n < 0 ? '#f97316' : '#22c55e' };
      }
      default: {
        const c = d.hotCues[i];
        return { top: String(i + 1), sub: c ? (c.type === 'loop' ? '⟳ ' : '') + formatTime(c.sec) : '—', set: !!c, bg: c ? c.color : undefined, fg: c ? '#0b0d10' : HOT_CUE_COLORS[i] + 'aa' };
      }
    }
  };

  const press = (i: number) => {
    tap();
    switch (mode) {
      case 'hotcue':
        dk.hotCuePress(i);
        break;
      case 'roll':
        dk.loopRoll(rollSizes[i], true);
        break;
      case 'slicer':
        dk.sliceHold(i, true, count);
        break;
      case 'beatjump':
        dk.beatJump(jumpSizes[i]);
        break;
    }
  };
  const release = (i: number) => {
    switch (mode) {
      case 'hotcue':
        dk.hotCueRelease(i);
        break;
      case 'roll':
        dk.loopRoll(rollSizes[i], false);
        break;
      case 'slicer':
        dk.sliceHold(i, false, count);
        break;
    }
  };

  const pads = Array.from({ length: count }, (_, i) => i);
  const padH = mobile ? 'h-10' : compact ? 'h-7' : 'h-10';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {PAD_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setPadMode(id, m.id)}
            className={cn('h-5 rounded px-2 text-[9px] font-bold uppercase tracking-wider transition-colors', mode === m.id ? 'text-bg' : 'bg-panel-3 text-text-faint hover:text-text-dim', mobile && 'h-6 px-2.5 text-[10px]')}
            style={mode === m.id ? { background: color } : undefined}
          >
            {m.label}
          </button>
        ))}
        {mode === 'slicer' && <span className="ml-1 truncate text-[9px] uppercase tracking-wider text-text-faint" title="Slicer: 8-beat domain, hold a pad to loop that slice">8 beats</span>}
      </div>
      <div className={cn('grid gap-1', count === 8 ? (compact ? 'grid-cols-8' : 'grid-cols-4') : 'grid-cols-4', mobile && 'gap-1.5')}>
        {pads.map((i) => {
          const L = padLabel(i);
          return (
            <motion.button
              key={`${mode}-${i}`}
              ref={(el) => {
                padRefs.current[i] = el;
              }}
              type="button"
              disabled={disabled}
              whileTap={{ scale: 0.93 }}
              className={cn('relative flex flex-col items-start justify-between rounded-md border px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40', padH, L.set && mode === 'hotcue' ? 'border-transparent' : mode === 'hotcue' ? 'border-border bg-panel-2 hover:border-border-2' : 'border-transparent')}
              style={L.set ? { background: mode === 'hotcue' ? `linear-gradient(180deg, ${L.bg}dd, ${L.bg}99)` : L.bg, color: L.fg, boxShadow: mode === 'hotcue' ? `0 0 12px ${L.bg}55, inset 0 1px 0 rgba(255,255,255,0.25)` : undefined } : { color: L.fg }}
              onPointerDown={(e) => {
                if (e.button === 2) return;
                e.preventDefault();
                try {
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                } catch {
                  /* synthetic / already-released pointer */
                }
                if (mode === 'hotcue' && e.shiftKey) dk.hotCueDelete(i);
                else press(i);
              }}
              onPointerUp={() => release(i)}
              onPointerCancel={() => release(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (mode === 'hotcue') dk.hotCueDelete(i);
              }}
              aria-label={`Pad ${i + 1} (${mode})`}
            >
              <span className={cn('font-black leading-none', compact ? 'text-[10px]' : 'text-xs')}>{L.top}</span>
              {!compact && <span className={cn('font-mono text-[9px] leading-none', L.set && mode === 'hotcue' ? 'text-bg/80' : 'opacity-70')}>{L.sub}</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
