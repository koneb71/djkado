import type { WaveformData } from '@/audio/dsp/waveform';
import type { BeatGrid } from '@/audio/dsp/beatgrid';
import type { HotCue, LoopInfo } from '@/audio/engine/types';

const LOW = [249, 115, 22];
const MID = [34, 197, 94];
const HIGH = [96, 165, 250];

/** Blend the three band colours by their relative energies (Serato-style). */
export function bandColor(l: number, m: number, h: number, alpha = 1): string {
  const sum = l + m + h || 1;
  const wl = l / sum;
  const wm = m / sum;
  const wh = h / sum;
  const r = LOW[0] * wl + MID[0] * wm + HIGH[0] * wh;
  const g = LOW[1] * wl + MID[1] * wm + HIGH[1] * wh;
  const b = LOW[2] * wl + MID[2] * wm + HIGH[2] * wh;
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}

/**
 * Pre-render the whole waveform into an offscreen canvas at `pxPerSec` resolution.
 * Cached per (waveform, pxPerSec, height) by the caller.
 */
export function renderWaveformStrip(w: WaveformData, pxPerSec: number, height: number, mirror = true): HTMLCanvasElement | OffscreenCanvas {
  const duration = w.length / w.binsPerSecond;
  const width = Math.max(1, Math.ceil(duration * pxPerSec));
  const maxW = 16000; // avoid absurd canvases; split isn't needed at our zoom levels for typical tracks
  const scale = width > maxW ? maxW / width : 1;
  const cw = Math.ceil(width * scale);
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, height) : Object.assign(document.createElement('canvas'), { width: cw, height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const binsPerPx = w.length / cw;
  const mid = mirror ? height / 2 : height;
  for (let x = 0; x < cw; x++) {
    const b0 = Math.floor(x * binsPerPx);
    const b1 = Math.max(b0 + 1, Math.floor((x + 1) * binsPerPx));
    let l = 0, m = 0, h = 0, p = 0;
    for (let b = b0; b < b1 && b < w.length; b++) {
      if (w.low[b] > l) l = w.low[b];
      if (w.mid[b] > m) m = w.mid[b];
      if (w.high[b] > h) h = w.high[b];
      if (w.peak[b] > p) p = w.peak[b];
    }
    if (p === 0) continue;
    const amp = (p / 255) * (mirror ? height / 2 : height) * 0.95;
    // draw layered bands: low (tallest weight) → mid → high, each scaled by own energy
    const lh = (l / 255) * (mirror ? height / 2 : height) * 0.95;
    const mh = (m / 255) * (mirror ? height / 2 : height) * 0.8;
    const hh = (h / 255) * (mirror ? height / 2 : height) * 0.65;
    ctx.fillStyle = bandColor(l, m, h, 0.35);
    if (mirror) ctx.fillRect(x, mid - amp, 1, amp * 2);
    else ctx.fillRect(x, mid - amp, 1, amp);
    ctx.fillStyle = `rgba(${LOW[0]},${LOW[1]},${LOW[2]},0.9)`;
    if (mirror) ctx.fillRect(x, mid - lh, 1, lh * 2);
    else ctx.fillRect(x, mid - lh, 1, lh);
    ctx.fillStyle = `rgba(${MID[0]},${MID[1]},${MID[2]},0.85)`;
    if (mirror) ctx.fillRect(x, mid - mh, 1, mh * 2);
    else ctx.fillRect(x, mid - mh, 1, mh);
    ctx.fillStyle = `rgba(${HIGH[0]},${HIGH[1]},${HIGH[2]},0.9)`;
    if (mirror) ctx.fillRect(x, mid - hh, 1, hh * 2);
    else ctx.fillRect(x, mid - hh, 1, hh);
  }
  return canvas;
}

export interface MarkerLayer {
  grid: BeatGrid | null;
  hotCues: (HotCue | null)[];
  loop: LoopInfo;
  cuePoint: number;
  duration: number;
}

/** Draw beat/bar lines for the visible window [t0, t1] onto ctx (x from time via toX). */
export function drawBeatGrid(ctx: CanvasRenderingContext2D, grid: BeatGrid, t0: number, t1: number, toX: (t: number) => number, height: number, dense = false) {
  const bl = 60 / grid.bpm;
  if (bl <= 0) return;
  const pxPerBeat = Math.abs(toX(t0 + bl) - toX(t0));
  if (pxPerBeat < 3) return;
  const startIdx = Math.floor((t0 - grid.firstBeatSec) / bl);
  const endIdx = Math.ceil((t1 - grid.firstBeatSec) / bl);
  for (let i = startIdx; i <= endIdx; i++) {
    const t = grid.firstBeatSec + i * bl;
    if (t < 0) continue;
    const x = toX(t);
    const isBar = ((i % 4) + 4) % 4 === 0;
    if (!isBar && pxPerBeat < 8 && !dense) continue;
    ctx.fillStyle = isBar ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(Math.round(x), 0, 1, isBar ? height : height * 0.35);
    if (isBar) ctx.fillRect(Math.round(x), height * 0.65, 1, height * 0.35);
  }
}

export function drawMarkers(ctx: CanvasRenderingContext2D, m: MarkerLayer, t0: number, t1: number, toX: (t: number) => number, height: number, opts: { labels?: boolean; loopFill?: boolean } = {}) {
  // loop region
  if (m.loop.enabled || (m.loop.end > m.loop.start && opts.loopFill)) {
    const x0 = toX(m.loop.start);
    const x1 = toX(m.loop.end);
    if (x1 > 0 && x0 < ctx.canvas.width) {
      ctx.fillStyle = m.loop.enabled ? 'rgba(34,211,238,0.14)' : 'rgba(34,211,238,0.06)';
      ctx.fillRect(x0, 0, x1 - x0, height);
      ctx.fillStyle = m.loop.enabled ? 'rgba(34,211,238,0.9)' : 'rgba(34,211,238,0.4)';
      ctx.fillRect(Math.round(x0), 0, 2, height);
      ctx.fillRect(Math.round(x1) - 2, 0, 2, height);
    }
  }
  // cue point
  if (m.cuePoint >= t0 && m.cuePoint <= t1) {
    const x = Math.round(toX(m.cuePoint));
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x, 0, 2, height);
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 6, 0);
    ctx.lineTo(x + 1, 6);
    ctx.closePath();
    ctx.fill();
  }
  // hot cues
  m.hotCues.forEach((c) => {
    if (!c || c.sec < t0 - 1 || c.sec > t1 + 1) return;
    const x = Math.round(toX(c.sec));
    ctx.fillStyle = c.color;
    ctx.fillRect(x, 0, 2, height);
    if (opts.labels) {
      ctx.fillStyle = c.color;
      ctx.fillRect(x, 0, 14, 12);
      ctx.fillStyle = '#0b0d10';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText(String(c.index + 1), x + 4, 9);
    }
    if (c.type === 'loop' && c.loopEnd !== undefined) {
      const x1 = toX(c.loopEnd);
      ctx.fillStyle = c.color + '33';
      ctx.fillRect(x, 0, x1 - x, height);
    }
  });
}
