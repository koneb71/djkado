import { motion } from 'motion/react';
import { Sparkles, SkipForward } from 'lucide-react';
import { useAutomix } from '@/store/automix';
import { useCrates } from '@/store/crates';
import { Automix } from '@/audio/engine/Automix';
import { Toggle } from '@/ui/Toggle';
import { Button } from '@/ui/Button';
import { deckColor } from '../deck/deckTheme';
import { tap } from '@/mobile/native';
import { cn } from '@/ui/cn';

const BARS = [4, 8, 16, 32] as const;

function automixStatusText(s: ReturnType<typeof useAutomix.getState>, queueLen: number): string {
  switch (s.phase) {
    case 'off':
      return 'Off';
    case 'empty':
      return queueLen ? 'Waiting…' : 'Queue empty — add tracks';
    case 'loading':
      return `Loading next → deck ${s.nextDeck ?? ''}`;
    case 'ready':
      return s.countdown !== null ? `Mix in ${Math.ceil(s.countdown)} s → deck ${s.nextDeck}` : `Next: deck ${s.nextDeck}`;
    case 'mixing':
      return `Mixing ${s.liveDeck} → ${s.nextDeck} · ${Math.round(s.progress * 100)}%`;
    default:
      return s.liveDeck ? `Playing deck ${s.liveDeck}` : s.nextDeck ? `Paused (deck ${s.nextDeck}) — Skip to continue` : 'Starting…';
  }
}

/** Auto DJ controls: on/off, mix length, options, live status + Skip. Shown above the queue and in the mobile library. */
export function AutomixBar({ compact }: { compact?: boolean }) {
  const st = useAutomix();
  const queueLen = useCrates((s) => s.queue.length);
  const status = automixStatusText(st, queueLen);
  const live = st.liveDeck;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5', st.enabled && 'bg-accent/[0.05]')}>
      <Toggle
        checked={st.enabled}
        onChange={(v) => {
          tap();
          st.setEnabled(v);
        }}
        label="Auto DJ"
      />
      <div className="flex items-center gap-1">
        <span className="text-[9px] uppercase tracking-widest text-text-faint">Mix</span>
        {BARS.map((b) => (
          <button key={b} type="button" onClick={() => st.setMixBars(b)} className={cn('h-6 rounded px-1.5 font-mono text-[10px] font-bold', st.mixBars === b ? 'bg-panel-3 text-text' : 'text-text-faint hover:text-text-dim')}>
            {b}
          </button>
        ))}
        <span className="text-[9px] text-text-faint">bars</span>
      </div>
      {!compact && (
        <>
          <Toggle checked={st.beatmatch} onChange={st.setBeatmatch} label="Beatmatch" />
          <Toggle checked={st.bassSwap} onChange={st.setBassSwap} label="Bass swap" />
          <Toggle checked={st.startAtCue} onChange={st.setStartAtCue} label="Start at cue" />
        </>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {st.enabled && (
          <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-accent">
            <Sparkles size={13} />
          </motion.span>
        )}
        <span className="min-w-0 truncate font-mono text-[11px] tabular text-text-dim" style={live && st.phase !== 'off' ? { color: deckColor(live) } : undefined}>
          {status}
        </span>
        {st.phase === 'mixing' && (
          <div className="h-1 w-24 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-accent" style={{ width: `${st.progress * 100}%` }} />
          </div>
        )}
        <Button size="xs" disabled={!st.enabled} onClick={() => Automix.skip()} title="Mix into the next track now">
          <SkipForward size={12} /> Skip
        </Button>
      </div>
    </div>
  );
}
