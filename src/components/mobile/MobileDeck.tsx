import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, RefreshCw, Repeat, ChevronLeft, ChevronRight, Music, Layers, Lock } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { deckRuntime, interpolatePos } from '@/store/runtime';
import { addFrameCallback } from '@/hooks/useAnimationFrame';
import { formatTime } from '@/audio/dsp/math';
import { WaveformScroll } from '../waveform/WaveformScroll';
import { PadGrid } from '../deck/PadGrid';
import { WaveformOverview } from '../waveform/WaveformOverview';
import { deckColor } from '../deck/deckTheme';
import { useStems } from '@/store/stems';
import { useFx } from '@/store/fx';
import { useMobileUi } from '@/mobile/store';
import { tap } from '@/mobile/native';
import { cn } from '@/ui/cn';

const fmtBeats = (b: number) => (b < 1 ? `1/${Math.round(1 / b)}` : String(b));

/** Compact touch-first deck for phones. The scrolling waveform doubles as the jog (drag = scrub/scratch). */
export function MobileDeck({ id, landscape }: { id: DeckId; landscape?: boolean }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const color = deckColor(id);
  const timeRef = useRef<HTMLSpanElement>(null);
  const stems = useStems((s) => s.decks[id]);
  const fxOn = useFx((s) => s.decks[id].some((slot) => slot.kind && slot.enabled));
  const setTab = useMobileUi((s) => s.setTab);
  const setMixDeck = useMobileUi((s) => s.setMixDeck);
  const setMixSection = useMobileUi((s) => s.setMixSection);

  useEffect(
    () =>
      addFrameCallback(() => {
        const rt = deckRuntime[id].get();
        const pos = interpolatePos(rt, AudioEngine.ctx.currentTime);
        if (timeRef.current) timeRef.current.textContent = '-' + formatTime(Math.max(0, (dk.duration || 0) - pos));
      }),
    [id, dk],
  );

  const bpm = d.bpm ? (d.bpm * d.rate).toFixed(1) : '--.-';
  const pitchPct = ((d.rate - 1) * 100).toFixed(1);

  return (
    <section className="panel noise relative flex min-h-0 flex-1 flex-col gap-1.5 p-2" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
      {/* header */}
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-panel-3">
          {d.track?.meta.artworkUrl ? <img src={d.track.meta.artworkUrl} alt="" className="h-full w-full object-cover" /> : <Music size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-text-faint" />}
          <span className="absolute -left-0.5 -top-0.5 rounded-sm px-1 text-[9px] font-black text-bg" style={{ background: color }}>
            {id}
          </span>
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-xs font-semibold">{d.track ? d.track.meta.title : <span className="text-text-faint">Tap Library to load a track</span>}</div>
          <div className="truncate text-[10px] text-text-dim">{d.track?.meta.artist ?? ''}</div>
        </div>
        <div className="shrink-0 text-right font-mono leading-tight tabular">
          <div className="text-sm font-bold" style={{ color }}>
            {bpm}
          </div>
          <div className="text-[9px] text-text-faint">{d.key || '--'} · <span ref={timeRef}>-00:00</span></div>
        </div>
      </div>

      <WaveformOverview id={id} height={14} />
      <div className="relative">
        <WaveformScroll id={id} height={landscape ? 54 : 64} />
        {d.analyzing && d.track && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
            <div className="h-full" style={{ width: `${d.analysisProgress * 100}%`, background: color }} />
          </div>
        )}
        {stems.active && (
          <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-[#f472b6]/80 px-1 text-[8px] font-black uppercase text-bg">
            Stems
          </span>
        )}
        {fxOn && (
          <button
            type="button"
            onClick={() => {
              setMixDeck(id);
              setMixSection('fx');
              setTab('mix');
            }}
            className="absolute left-1 top-1 rounded-sm bg-accent/80 px-1 text-[8px] font-black uppercase text-bg"
          >
            FX on
          </button>
        )}
      </div>

      {/* transport */}
      <div className="grid grid-cols-5 gap-1.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          className="h-11 rounded-md border border-border bg-panel-3 text-xs font-black text-text-dim active:bg-panel-2"
          disabled={!d.track}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            tap();
            dk.cuePress();
          }}
          onPointerUp={() => dk.cueRelease()}
          onPointerCancel={() => dk.cueRelease()}
        >
          CUE
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          className="col-span-2 flex h-11 items-center justify-center rounded-md border text-bg"
          style={{ background: d.playing ? color : 'var(--color-panel-3)', borderColor: d.playing ? color : 'var(--color-border)', color: d.playing ? '#0b0d10' : 'var(--color-text)', boxShadow: d.playing ? `0 0 16px ${color}66` : undefined }}
          disabled={!d.track}
          onClick={() => {
            tap();
            dk.togglePlay();
          }}
          aria-label="Play/Pause"
        >
          {d.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          className={cn('flex h-11 items-center justify-center gap-1 rounded-md border text-[10px] font-bold uppercase', d.sync ? '' : 'border-border bg-panel-3 text-text-dim')}
          style={d.sync ? { color: d.isMaster ? '#f59e0b' : color, borderColor: d.isMaster ? '#f59e0b' : color, background: (d.isMaster ? '#f59e0b' : color) + '22' } : undefined}
          disabled={!d.track || !d.capabilities.sync}
          onClick={() => {
            tap();
            AudioEngine.toggleSync(id);
          }}
        >
          <RefreshCw size={12} /> {d.isMaster ? 'Mstr' : 'Sync'}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          className={cn('flex h-11 items-center justify-center gap-1 rounded-md border text-[10px] font-bold uppercase', d.loop.enabled ? '' : 'border-border bg-panel-3 text-text-dim')}
          style={d.loop.enabled ? { color, borderColor: color, background: color + '22' } : undefined}
          disabled={!d.track || !d.capabilities.loops}
          onClick={() => {
            tap();
            if (d.loop.enabled) dk.exitLoop();
            else dk.autoLoop(d.autoLoopBeats);
          }}
        >
          <Repeat size={12} /> {fmtBeats(d.autoLoopBeats)}
        </motion.button>
      </div>

      {/* performance pads (4 on phones) */}
      <PadGrid id={id} count={4} mobile />

      {/* pitch + loop size + shortcuts */}
      <div className="flex items-center gap-1.5">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded border border-border bg-panel-3 text-text-dim" disabled={!d.track} onClick={() => dk.loopHalve()} aria-label="Halve loop">
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded border border-border bg-panel-3 text-text-dim" disabled={!d.track} onClick={() => dk.loopDouble()} aria-label="Double loop">
          <ChevronRight size={14} />
        </button>
        <div className="relative mx-1 flex h-8 flex-1 items-center">
          <input
            type="range"
            min={-1}
            max={1}
            step={0.001}
            value={d.pitch}
            onChange={(e) => dk.setPitch(Number(e.target.value))}
            onDoubleClick={() => dk.setPitch(0)}
            disabled={!d.capabilities.tempo}
            className="mobile-range w-full"
            style={{ ['--c' as string]: color }}
            aria-label="Pitch"
          />
          <span className="pointer-events-none absolute -top-2 right-0 font-mono text-[9px] text-text-faint">{Number(pitchPct) >= 0 ? '+' : ''}{pitchPct}%</span>
        </div>
        <button
          type="button"
          className={cn('flex h-8 w-8 items-center justify-center rounded border', d.keylock ? 'border-transparent' : 'border-border bg-panel-3 text-text-dim')}
          style={d.keylock ? { color, borderColor: color, background: color + '22' } : undefined}
          disabled={!d.capabilities.keylock}
          onClick={() => dk.setKeylock(!d.keylock)}
          aria-label="Key lock"
        >
          <Lock size={13} />
        </button>
        <button
          type="button"
          className={cn('flex h-8 w-8 items-center justify-center rounded border', stems.active ? 'border-transparent' : 'border-border bg-panel-3 text-text-dim')}
          style={stems.active ? { color: '#f472b6', borderColor: '#f472b6', background: '#f472b622' } : undefined}
          disabled={!d.capabilities.stems}
          onClick={() => {
            setMixDeck(id);
            setMixSection('stems');
            setTab('mix');
          }}
          aria-label="Stems"
        >
          <Layers size={13} />
        </button>
      </div>
    </section>
  );
}
