import { useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { useUi } from '@/store/ui';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { LocalLibrary } from '@/services/localLibrary/LocalLibrary';
import { findTrack, DND_MIME } from '@/services/tracks/registry';
import { DeckHeader } from './DeckHeader';
import { WaveformOverview } from '../waveform/WaveformOverview';
import { WaveformScroll } from '../waveform/WaveformScroll';
import { JogWheel } from '../jog/JogWheel';
import { Transport } from './Transport';
import { PitchFader } from './PitchFader';
import { HotCues } from './HotCues';
import { LoopControls } from './LoopControls';
import { FxPanel } from '../fx/FxPanel';
import { Button } from '@/ui/Button';
import { deckColor } from './deckTheme';
import { cn } from '@/ui/cn';

export function DeckView({ id, compact }: { id: DeckId; compact?: boolean }) {
  const d = useDeck(id);
  const color = deckColor(id);
  const fxOpen = useUi((s) => s.fxOpen[id]);
  const toggleFx = useUi((s) => s.toggleFx);
  const focused = useUi((s) => s.focusedDeck === id);
  const setFocused = useUi((s) => s.setFocusedDeck);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const trackId = e.dataTransfer.getData(DND_MIME);
    if (trackId) {
      const t = findTrack(trackId);
      if (t) AudioEngine.deck(id).load(t);
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      const added = await LocalLibrary.addFiles(files);
      if (added[0]) AudioEngine.deck(id).load(added[0]);
      else toast.error('Not an audio file');
    }
  };

  return (
    <motion.section
      layout
      onPointerDownCapture={() => setFocused(id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_MIME) || e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn('panel noise relative flex h-full flex-col gap-2 p-2.5 transition-shadow', focused && 'ring-1 ring-inset')}
      style={{ ['--tw-ring-color' as string]: focused ? color + '55' : undefined, boxShadow: dragOver ? `0 0 0 2px ${color}, 0 0 30px ${color}55` : undefined }}
      aria-label={`Deck ${id}`}
    >
      {/* deck colour bar */}
      <div className="pointer-events-none absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />

      <DeckHeader id={id} compact={compact} />

      {d.error && (
        <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger">
          <AlertTriangle size={12} /> {d.error}
        </div>
      )}

      <WaveformOverview id={id} height={compact ? 22 : 30} />
      <div className="relative">
        <WaveformScroll id={id} height={compact ? 52 : 96} />
        <AnimatePresence>
          {d.analyzing && d.track && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-bg/80 to-transparent px-2 pb-1 pt-4 text-[10px] uppercase tracking-widest text-text-dim">
              <Sparkles size={11} className="text-accent" />
              Analyzing… {Math.round(d.analysisProgress * 100)}%
              <div className="ml-auto h-1 w-40 overflow-hidden rounded bg-white/10">
                <motion.div className="h-full" style={{ background: color }} animate={{ width: `${d.analysisProgress * 100}%` }} transition={{ ease: 'linear', duration: 0.15 }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={cn('flex min-h-0 flex-1 items-stretch gap-3', compact && 'gap-2')}>
        <div className="flex shrink-0 items-center">
          <JogWheel id={id} size={compact ? 108 : 160} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
          <Transport id={id} compact={compact} />
          <HotCues id={id} compact={compact} />
          <div className="flex items-center justify-between gap-2">
            <LoopControls id={id} compact={compact} />
            <Button size={compact ? 'xs' : 'sm'} active={fxOpen} activeColor={color} onClick={() => toggleFx(id)} disabled={!d.capabilities.fx}>
              FX
            </Button>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <PitchFader id={id} height={compact ? 96 : 150} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {fxOpen && (
          <motion.div key="fx" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} className="absolute inset-x-2 bottom-2 z-20 rounded-lg border border-border bg-panel/95 p-2 shadow-2xl backdrop-blur-md" style={{ boxShadow: `0 -8px 30px rgba(0,0,0,0.6), 0 0 0 1px ${color}33` }}>
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-faint">Effects · Deck {id}</span>
              <button type="button" onClick={() => toggleFx(id)} className="text-[10px] uppercase tracking-wider text-text-dim hover:text-text">
                Close
              </button>
            </div>
            <FxPanel id={id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
