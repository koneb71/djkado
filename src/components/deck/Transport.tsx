import { Pause, Play, RefreshCw, Lock, GitBranch, Rewind, Magnet, Undo2, Zap } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { deckColor } from './deckTheme';
import { cn } from '@/ui/cn';

export function Transport({ id, compact }: { id: DeckId; compact?: boolean }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const color = deckColor(id);
  const caps = d.capabilities;
  const size = compact ? 'sm' : 'md';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tooltip label="Cue (hold to preview)">
        <Button
          size={size}
          className={cn('font-black', compact ? 'w-12' : 'w-14')}
          disabled={!d.track}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            dk.cuePress();
          }}
          onPointerUp={() => dk.cueRelease()}
          onPointerCancel={() => dk.cueRelease()}
          onKeyDown={(e) => e.key === ' ' && e.preventDefault()}
        >
          CUE
        </Button>
      </Tooltip>
      <Tooltip label={d.playing ? 'Pause' : 'Play'}>
        <Button size={size} className={cn(compact ? 'w-12' : 'w-14')} active={d.playing} activeColor={color} disabled={!d.track} onClick={() => dk.togglePlay()} aria-label="Play/Pause">
          {d.playing ? <Pause size={compact ? 14 : 16} fill="currentColor" /> : <Play size={compact ? 14 : 16} fill="currentColor" />}
        </Button>
      </Tooltip>
      <Tooltip label="Sync tempo & phase to master">
        <Button size={size} active={d.sync} activeColor={d.isMaster ? '#f59e0b' : color} disabled={!d.track || !caps.sync} onClick={() => AudioEngine.toggleSync(id)}>
          <RefreshCw size={12} /> {d.isMaster ? 'Master' : 'Sync'}
        </Button>
      </Tooltip>
      {!compact && (
        <>
          <Tooltip label="Key lock (master tempo)">
            <Button size={size} square active={d.keylock} activeColor={color} disabled={!caps.keylock} onClick={() => dk.setKeylock(!d.keylock)} aria-label="Key lock">
              <Lock size={13} />
            </Button>
          </Tooltip>
          <Tooltip label="Slip mode">
            <Button size={size} square active={d.slip} activeColor={color} disabled={!caps.scratch} onClick={() => dk.setSlip(!d.slip)} aria-label="Slip">
              <GitBranch size={13} />
            </Button>
          </Tooltip>
          <Tooltip label="Quantize">
            <Button size={size} square active={d.quantize} activeColor={color} disabled={!caps.loops} onClick={() => dk.setQuantize(!d.quantize)} aria-label="Quantize">
              <Magnet size={13} />
            </Button>
          </Tooltip>
          <Tooltip label="Censor (reverse while held)">
            <Button size={size} square disabled={!caps.reverse} onPointerDown={() => dk.censor(true)} onPointerUp={() => dk.censor(false)} onPointerLeave={() => dk.censor(false)} aria-label="Censor">
              <Rewind size={13} />
            </Button>
          </Tooltip>
          <Tooltip label="Brake">
            <Button size={size} square disabled={!caps.tempo} onClick={() => dk.brake()} aria-label="Brake">
              <Undo2 size={13} />
            </Button>
          </Tooltip>
          <Tooltip label="Backspin">
            <Button size={size} square disabled={!caps.tempo} onClick={() => dk.backspin()} aria-label="Backspin">
              <Zap size={13} />
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
