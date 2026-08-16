import { ChevronLeft, ChevronRight, Repeat, SkipBack, SkipForward } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { deckColor } from './deckTheme';
import { cn } from '@/ui/cn';

const fmtBeats = (b: number) => (b < 1 ? `1/${Math.round(1 / b)}` : String(b));

export function LoopControls({ id, compact }: { id: DeckId; compact?: boolean }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const color = deckColor(id);
  const disabled = !d.track || !d.capabilities.loops;
  const size = compact ? 'xs' : 'sm';
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Tooltip label="Beat jump back">
        <Button size={size} square disabled={disabled} onClick={() => dk.beatJump(-d.autoLoopBeats)} aria-label="Beat jump back">
          <SkipBack size={12} />
        </Button>
      </Tooltip>
      <Tooltip label="Halve loop">
        <Button size={size} square disabled={disabled} onClick={() => dk.loopHalve()} aria-label="Halve loop">
          <ChevronLeft size={12} />
        </Button>
      </Tooltip>
      <Tooltip label={d.loop.enabled ? 'Exit loop' : 'Auto loop'}>
        <Button size={size} active={d.loop.enabled} activeColor={color} disabled={disabled} onClick={() => (d.loop.enabled ? dk.exitLoop() : dk.autoLoop(d.autoLoopBeats))} className={cn('font-mono', compact ? 'w-14' : 'w-[72px]')}>
          <Repeat size={11} /> {fmtBeats(d.autoLoopBeats)}
        </Button>
      </Tooltip>
      <Tooltip label="Double loop">
        <Button size={size} square disabled={disabled} onClick={() => dk.loopDouble()} aria-label="Double loop">
          <ChevronRight size={12} />
        </Button>
      </Tooltip>
      <Tooltip label="Beat jump forward">
        <Button size={size} square disabled={disabled} onClick={() => dk.beatJump(d.autoLoopBeats)} aria-label="Beat jump forward">
          <SkipForward size={12} />
        </Button>
      </Tooltip>
      {!compact && (
        <>
          <div className="mx-1 h-5 w-px bg-border" />
          <Tooltip label="Loop in">
            <Button size={size} disabled={disabled} onClick={() => dk.loopIn()}>
              In
            </Button>
          </Tooltip>
          <Tooltip label="Loop out">
            <Button size={size} disabled={disabled} onClick={() => dk.loopOut()}>
              Out
            </Button>
          </Tooltip>
          <Tooltip label="Reloop / exit">
            <Button size={size} disabled={disabled} onClick={() => dk.toggleLoop()}>
              Reloop
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
