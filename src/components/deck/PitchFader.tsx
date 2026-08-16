import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { Fader } from '@/ui/Fader';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { deckColor } from './deckTheme';

const RANGES = [0.08, 0.16, 0.5];

export function PitchFader({ id, height = 150 }: { id: DeckId; height?: number }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const color = deckColor(id);
  const disabled = !d.capabilities.tempo;
  const nextRange = () => {
    const i = RANGES.indexOf(d.pitchRange);
    dk.setPitchRange(RANGES[(i + 1) % RANGES.length]);
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <Tooltip label="Pitch range">
        <Button size="xs" onClick={nextRange} disabled={disabled} className="w-12 font-mono">
          ±{Math.round(d.pitchRange * 100)}%
        </Button>
      </Tooltip>
      <Tooltip label="Bend +">
        <Button size="xs" square disabled={disabled} onPointerDown={() => dk.bend(1, 400)} aria-label="Pitch bend up">
          <ChevronUp size={12} />
        </Button>
      </Tooltip>
      {/* inverted: up = slower (like hardware) */}
      <Fader value={-d.pitch} min={-1} max={1} defaultValue={0} onChange={(v) => dk.setPitch(-v)} length={height} thickness={34} color={color} centerDetent ticks={9} disabled={disabled} />
      <Tooltip label="Bend −">
        <Button size="xs" square disabled={disabled} onPointerDown={() => dk.bend(-1, 400)} aria-label="Pitch bend down">
          <ChevronDown size={12} />
        </Button>
      </Tooltip>
      <div className="font-mono text-[10px] tabular text-text-dim">{((d.rate - 1) * 100 >= 0 ? '+' : '') + ((d.rate - 1) * 100).toFixed(1)}%</div>
    </div>
  );
}
