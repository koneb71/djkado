import { useEffect, useRef } from 'react';
import { motion, useMotionValue } from 'motion/react';
import type { DeckId } from '@/audio/engine/types';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { deckRuntime, interpolatePos, jogVelocity } from '@/store/runtime';
import { addFrameCallback } from '@/hooks/useAnimationFrame';
import { useDeck } from '@/store/decks';
import { useUi } from '@/store/ui';
import { deckColor } from '../deck/deckTheme';
import { beatPhase } from '@/audio/dsp/beatgrid';

const RPM = 33.333;

/**
 * Jog wheel: SVG rings + platter that rotates with the real playhead. Touching the platter top
 * (vinyl mode) scratches; touching the outer ring nudges (pitch bend). Angular velocity from
 * pointer angle deltas over time, with light smoothing.
 */
export function JogWheel({ id, size = 180 }: { id: DeckId; size?: number }) {
  const deck = useDeck(id);
  const vinylMode = useUi((s) => s.vinylMode);
  const color = deckColor(id);
  const rotation = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ mode: 'scratch' | 'nudge'; lastAngle: number; lastT: number; vel: number } | null>(null);
  const beatRef = useRef<HTMLDivElement>(null);
  const capable = deck.capabilities.scratch;

  useEffect(() => {
    return addFrameCallback(() => {
      const rt = deckRuntime[id].get();
      const pos = interpolatePos(rt, AudioEngine.ctx.currentTime);
      rotation.set(((pos * RPM) / 60) * 360);
      // beat flash ring
      const el = beatRef.current;
      const g = AudioEngine.deck(id).beatGrid;
      if (el) {
        if (g && rt.playing) {
          const ph = beatPhase(g, pos);
          const glow = Math.max(0, 1 - ph * 3);
          el.style.opacity = String(glow * 0.9);
        } else el.style.opacity = '0';
      }
    });
  }, [id, rotation]);

  const angleOf = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return { angle: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI, dist: Math.hypot(e.clientX - cx, e.clientY - cy) / (r.width / 2) };
  };

  const onDown = (e: React.PointerEvent) => {
    const dk = AudioEngine.deck(id);
    if (!dk.hasTrack) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const { angle, dist } = angleOf(e);
    const mode: 'scratch' | 'nudge' = vinylMode && dist < 0.78 && capable ? 'scratch' : 'nudge';
    touch.current = { mode, lastAngle: angle, lastT: performance.now(), vel: 0 };
    if (mode === 'scratch') dk.jogTouch(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const t = touch.current;
    if (!t) return;
    const dk = AudioEngine.deck(id);
    const { angle } = angleOf(e);
    let d = angle - t.lastAngle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const now = performance.now();
    const dt = Math.max(1, now - t.lastT) / 1000;
    const inst = d / 360 / dt; // rev/s
    t.vel = t.vel * 0.5 + inst * 0.5;
    t.lastAngle = angle;
    t.lastT = now;
    jogVelocity[id].set(t.vel);
    if (t.mode === 'scratch') dk.jogScratch(t.vel);
    else dk.jogNudge(t.vel * 0.15);
  };
  const onUp = () => {
    const t = touch.current;
    if (!t) return;
    const dk = AudioEngine.deck(id);
    if (t.mode === 'scratch') dk.jogTouch(false);
    jogVelocity[id].set(0);
    touch.current = null;
  };

  // stop scratching if pointer is held but no movement (velocity decays)
  useEffect(() => {
    const iv = setInterval(() => {
      const t = touch.current;
      if (!t) return;
      if (performance.now() - t.lastT > 60) {
        t.vel *= 0.4;
        if (t.mode === 'scratch') AudioEngine.deck(id).jogScratch(Math.abs(t.vel) < 0.02 ? 0 : t.vel);
      }
    }, 60);
    return () => clearInterval(iv);
  }, [id]);

  const art = deck.track?.meta.artworkUrl;
  const inner = size * 0.78;

  return (
    <div
      ref={ref}
      className="relative select-none touch-none"
      style={{ width: size, height: size, cursor: capable ? 'grab' : 'default' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* outer ring (nudge zone) */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, #1a1f27, #2a303b, #1a1f27, #2a303b, #1a1f27)',
          boxShadow: 'inset 0 0 0 1px #363d4a, 0 6px 22px rgba(0,0,0,0.65), inset 0 -4px 12px rgba(0,0,0,0.6)',
        }}
      />
      {/* tick marks */}
      <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const r0 = size / 2 - 3;
          const r1 = size / 2 - (i % 5 === 0 ? 10 : 6);
          return <line key={i} x1={size / 2 + Math.cos(a) * r0} y1={size / 2 + Math.sin(a) * r0} x2={size / 2 + Math.cos(a) * r1} y2={size / 2 + Math.sin(a) * r1} stroke={i % 5 === 0 ? '#5a6474' : '#3a4250'} strokeWidth={1} />;
        })}
      </svg>
      {/* beat flash */}
      <div ref={beatRef} className="pointer-events-none absolute rounded-full transition-opacity duration-75" style={{ inset: (size - inner) / 2 - 3, boxShadow: `0 0 0 3px ${color}, 0 0 22px ${color}`, opacity: 0 }} />
      {/* platter */}
      <motion.div
        className="absolute rounded-full overflow-hidden"
        style={{
          width: inner,
          height: inner,
          left: (size - inner) / 2,
          top: (size - inner) / 2,
          rotate: rotation,
          background: art ? undefined : 'repeating-radial-gradient(circle at center, #101318 0px, #101318 2px, #1a1e26 3px, #1a1e26 4px)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.7)',
        }}
      >
        {art && <img src={art} alt="" className="h-full w-full object-cover opacity-90" draggable={false} />}
        {!art && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full" style={{ width: inner * 0.34, height: inner * 0.34, background: `radial-gradient(circle at 40% 35%, ${color}, ${color}88 60%, #0b0d10 62%)` }} />
          </div>
        )}
        {/* position marker */}
        <div className="absolute left-1/2 top-1 h-[14%] w-[3px] -translate-x-1/2 rounded-full bg-white/90" style={{ boxShadow: '0 0 6px rgba(255,255,255,0.7)' }} />
      </motion.div>
      {/* center cap */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #4a5262, #1a1e26)', boxShadow: '0 1px 3px rgba(0,0,0,0.8)' }} />
    </div>
  );
}
