import { useEffect, useRef } from 'react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { deckRuntime, interpolatePos } from '@/store/runtime';
import { addFrameCallback } from '@/hooks/useAnimationFrame';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { renderWaveformStrip, drawMarkers } from './waveformRenderer';
import { deckColor } from '../deck/deckTheme';

/** Whole-track overview: click/drag to seek, shows cues, loop and elapsed tint. */
export function WaveformOverview({ id, height = 34 }: { id: DeckId; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const deck = useDeck(id);
  const stripRef = useRef<{ key: string; canvas: HTMLCanvasElement | OffscreenCanvas; width: number } | null>(null);
  const stateRef = useRef(deck);
  stateRef.current = deck;
  const color = deckColor(id);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    let w = wrap.clientWidth;
    const resize = () => {
      w = wrap.clientWidth;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      const d = stateRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);
      const dur = d.duration || 1;
      const toX = (t: number) => (t / dur) * w;
      if (d.waveform) {
        const key = `${d.track?.meta.id}|${w}|${height}`;
        if (!stripRef.current || stripRef.current.key !== key) {
          stripRef.current = { key, canvas: renderWaveformStrip(d.waveform, w / dur, height, true), width: w };
        }
        ctx.drawImage(stripRef.current.canvas as CanvasImageSource, 0, 0, w, height);
      } else if (d.track && d.analyzing) {
        // progress shimmer
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, height / 2 - 1, w, 2);
        ctx.fillStyle = color;
        ctx.fillRect(0, height / 2 - 1, w * d.analysisProgress, 2);
      } else if (d.track && !d.capabilities.waveform) {
        // stream deck: animated gradient bar
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, color + '33');
        g.addColorStop(1, color + '11');
        ctx.fillStyle = g;
        ctx.fillRect(0, height * 0.35, w, height * 0.3);
      }
      if (!d.track) return;
      const rt = deckRuntime[id].get();
      const pos = interpolatePos(rt, AudioEngine.ctx.currentTime);
      // elapsed tint
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, toX(pos), height);
      drawMarkers(ctx, { grid: d.grid, hotCues: d.hotCues, loop: d.loop, cuePoint: d.cuePoint, duration: dur }, 0, dur, toX, height, { loopFill: true });
      // playhead
      const x = Math.round(toX(pos));
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, 0, 2, height);
      ctx.fillStyle = color;
      ctx.fillRect(x - 1, 0, 4, 3);
      ctx.fillRect(x - 1, height - 3, 4, 3);
    };
    const stop = addFrameCallback(draw);
    return () => {
      stop();
      ro.disconnect();
    };
  }, [id, height, color]);

  const seekFromEvent = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * (stateRef.current.duration || 0);
    AudioEngine.deck(id).seek(t);
  };
  const dragging = useRef(false);

  return (
    <div
      ref={wrapRef}
      className="relative w-full cursor-pointer overflow-hidden rounded-md bg-bg-elev"
      style={{ height }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        seekFromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && seekFromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
