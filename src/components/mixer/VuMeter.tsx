import { useEffect, useRef } from 'react';
import type { Channel, MeterLevels } from '@/store/runtime';
import { addFrameCallback } from '@/hooks/useAnimationFrame';

/** Canvas VU meter (stereo or mono) driven from a runtime channel. */
export function VuMeter({ channel, width = 8, height = 120, stereo = false, horizontal = false, className }: { channel: Channel<MeterLevels>; width?: number; height?: number; stereo?: boolean; horizontal?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = horizontal ? height : width;
    const h = horizontal ? width : height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const segs = 20;
    let smoothL = 0;
    let smoothR = 0;
    const draw = () => {
      const m = channel.get();
      const toDb = (v: number) => (v <= 0 ? -60 : 20 * Math.log10(v));
      const norm = (v: number) => Math.max(0, Math.min(1, (toDb(v) + 48) / 48));
      const tl = norm(m.l);
      const tr = norm(stereo ? m.r : m.l);
      smoothL = tl > smoothL ? tl : smoothL * 0.85 + tl * 0.15;
      smoothR = tr > smoothR ? tr : smoothR * 0.85 + tr * 0.15;
      const pl = norm(m.peakL);
      const pr = norm(stereo ? m.peakR : m.peakL);
      ctx.clearRect(0, 0, w, h);
      const bars = stereo ? [smoothL, smoothR] : [smoothL];
      const peaks = stereo ? [pl, pr] : [pl];
      const gap = 1;
      const len = horizontal ? w : h;
      const thick = horizontal ? h : w;
      const barThick = (thick - (bars.length - 1) * 2) / bars.length;
      bars.forEach((v, bi) => {
        const off = bi * (barThick + 2);
        for (let s = 0; s < segs; s++) {
          const t = s / segs;
          const on = t < v;
          const color = t > 0.9 ? '#ef4444' : t > 0.75 ? '#f59e0b' : '#22c55e';
          ctx.fillStyle = on ? color : 'rgba(255,255,255,0.05)';
          const segLen = len / segs - gap;
          if (horizontal) ctx.fillRect(t * len, off, segLen, barThick);
          else ctx.fillRect(off, len - (t * len + segLen), barThick, segLen);
        }
        const p = peaks[bi];
        if (p > 0.02) {
          ctx.fillStyle = p > 0.95 ? '#ef4444' : '#e6e9ef';
          if (horizontal) ctx.fillRect(p * len - 1, off, 2, barThick);
          else ctx.fillRect(off, len - p * len - 1, barThick, 2);
        }
      });
    };
    return addFrameCallback(draw);
  }, [channel, width, height, stereo, horizontal]);
  return <canvas ref={ref} className={className} style={{ width: horizontal ? height : width, height: horizontal ? width : height }} />;
}
