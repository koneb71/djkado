import { useEffect, useRef } from 'react';
import type { DeckId } from '@/audio/engine/types';
import { useDeck } from '@/store/decks';
import { deckRuntime, interpolatePos } from '@/store/runtime';
import { addFrameCallback } from '@/hooks/useAnimationFrame';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { bandColor, drawBeatGrid, drawMarkers } from './waveformRenderer';
import { deckColor } from '../deck/deckTheme';
import { useUi } from '@/store/ui';
import type { WaveformData } from '@/audio/dsp/waveform';

const TILE = 1024;

function renderTile(w: WaveformData, tileIdx: number, pxPerSec: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(TILE, height) : Object.assign(document.createElement('canvas'), { width: TILE, height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const binsPerPx = w.binsPerSecond / pxPerSec;
  const mid = height / 2;
  const x0 = tileIdx * TILE;
  for (let x = 0; x < TILE; x++) {
    const b0 = Math.floor((x0 + x) * binsPerPx);
    if (b0 >= w.length) break;
    const b1 = Math.max(b0 + 1, Math.floor((x0 + x + 1) * binsPerPx));
    let l = 0, m = 0, h = 0, p = 0;
    for (let b = b0; b < b1 && b < w.length; b++) {
      if (w.low[b] > l) l = w.low[b];
      if (w.mid[b] > m) m = w.mid[b];
      if (w.high[b] > h) h = w.high[b];
      if (w.peak[b] > p) p = w.peak[b];
    }
    if (p === 0) continue;
    const amp = (p / 255) * mid * 0.96;
    ctx.fillStyle = bandColor(l, m, h, 0.28);
    ctx.fillRect(x, mid - amp, 1, amp * 2);
    const lh = (l / 255) * mid * 0.96;
    const mh = (m / 255) * mid * 0.8;
    const hh = (h / 255) * mid * 0.6;
    ctx.fillStyle = 'rgba(249,115,22,0.95)';
    ctx.fillRect(x, mid - lh, 1, lh * 2);
    ctx.fillStyle = 'rgba(34,197,94,0.9)';
    ctx.fillRect(x, mid - mh, 1, mh * 2);
    ctx.fillStyle = 'rgba(96,165,250,0.95)';
    ctx.fillRect(x, mid - hh, 1, hh * 2);
  }
  return canvas;
}

/** Zoomable scrolling waveform with fixed centre playhead, beat grid, cue/loop markers; drag to scrub, wheel to zoom. */
export function WaveformScroll({ id, height = 96 }: { id: DeckId; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const deck = useDeck(id);
  const zoom = useUi((s) => s.waveformZoom);
  const setZoom = useUi((s) => s.setWaveformZoom);
  const stateRef = useRef(deck);
  stateRef.current = deck;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const tiles = useRef<{ key: string; map: Map<number, HTMLCanvasElement | OffscreenCanvas> }>({ key: '', map: new Map() });
  const color = deckColor(id);
  const drag = useRef<{ x: number; pos: number; wasPlaying: boolean } | null>(null);

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
      const visibleSec = zoomRef.current;
      const pxPerSec = w / visibleSec;
      const rt = deckRuntime[id].get();
      const pos = d.track ? interpolatePos(rt, AudioEngine.ctx.currentTime) : 0;
      const t0 = pos - visibleSec / 2;
      const t1 = pos + visibleSec / 2;
      const toX = (t: number) => (t - t0) * pxPerSec;

      // background beat shading for bars
      if (d.waveform) {
        const key = `${d.track?.meta.id}|${pxPerSec.toFixed(3)}|${height}`;
        if (tiles.current.key !== key) tiles.current = { key, map: new Map() };
        const firstTile = Math.max(0, Math.floor((t0 * pxPerSec) / TILE));
        const lastTile = Math.floor((t1 * pxPerSec) / TILE);
        for (let ti = firstTile; ti <= lastTile; ti++) {
          let tile = tiles.current.map.get(ti);
          if (!tile) {
            tile = renderTile(d.waveform, ti, pxPerSec, height);
            tiles.current.map.set(ti, tile);
            if (tiles.current.map.size > 24) {
              const firstKey = tiles.current.map.keys().next().value;
              if (firstKey !== undefined) tiles.current.map.delete(firstKey);
            }
          }
          const x = ti * TILE - t0 * pxPerSec;
          ctx.drawImage(tile as CanvasImageSource, x, 0);
        }
      } else if (d.track && d.analyzing) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let x = 0; x < w; x += 6) {
          const hgt = (Math.sin(x * 0.05 + performance.now() / 300) * 0.5 + 0.5) * height * 0.5 + 4;
          ctx.fillRect(x, height / 2 - hgt / 2, 3, hgt);
        }
      } else if (d.track && !d.capabilities.waveform) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'transparent');
        g.addColorStop(0.5, color + '55');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, height / 2 - 6, w, 12);
      }
      // past shading
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, w / 2, height);
      if (d.grid && d.track) drawBeatGrid(ctx, d.grid, t0, t1, toX, height);
      if (d.track) drawMarkers(ctx, { grid: d.grid, hotCues: d.hotCues, loop: d.loop, cuePoint: d.cuePoint, duration: d.duration }, t0, t1, toX, height, { labels: true });
      // slip ghost
      if (d.slip && rt.playing && Math.abs(rt.slipPos - pos) > 0.05) {
        const gx = toX(rt.slipPos);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(Math.round(gx), 0, 2, height);
      }
      // playhead
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(w / 2) - 1, 0, 2, height);
      ctx.shadowColor = color;
    };
    const stop = addFrameCallback(draw);
    return () => {
      stop();
      ro.disconnect();
    };
  }, [id, height, color]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full cursor-grab overflow-hidden rounded-md bg-bg-elev active:cursor-grabbing"
      style={{ height }}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          setZoom(zoomRef.current * (e.deltaY > 0 ? 1.15 : 1 / 1.15));
        } else {
          AudioEngine.deck(id).scrub((e.deltaX / (wrapRef.current?.clientWidth || 800)) * zoomRef.current);
        }
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        const dk = AudioEngine.deck(id);
        if (!dk.hasTrack) return;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, pos: dk.position, wasPlaying: dk.playing };
        if (dk.playing && dk.capabilities.scratch) dk.jogTouch(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dk = AudioEngine.deck(id);
        const dx = e.clientX - drag.current.x;
        const dt = -(dx / (wrapRef.current?.clientWidth || 800)) * zoomRef.current;
        if (drag.current.wasPlaying && dk.capabilities.scratch) {
          // scratch: velocity from movement (approx)
          const rate = (-(e.movementX / (wrapRef.current?.clientWidth || 800)) * zoomRef.current) / (1 / 60);
          dk.jogScratch(rate * (33.333 / 60));
        } else dk.seek(drag.current.pos + dt);
      }}
      onPointerUp={() => {
        const dk = AudioEngine.deck(id);
        if (drag.current?.wasPlaying) dk.jogTouch(false);
        drag.current = null;
      }}
      onPointerCancel={() => {
        AudioEngine.deck(id).jogTouch(false);
        drag.current = null;
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
