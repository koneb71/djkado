import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { motion } from 'motion/react';
import { cn } from './cn';

export interface FaderProps {
  value: number; // 0..1 (or min..max)
  min?: number;
  max?: number;
  defaultValue?: number;
  onChange: (v: number) => void;
  orientation?: 'vertical' | 'horizontal';
  length?: number; // px
  thickness?: number;
  label?: string;
  color?: string;
  centerDetent?: boolean; // snap near center
  ticks?: number; // number of tick marks
  className?: string;
  disabled?: boolean;
  capClassName?: string;
}

/** Linear fader (vertical by default). Drag, wheel, arrows, double-click reset. */
export function Fader({ value, min = 0, max = 1, defaultValue, onChange, orientation = 'vertical', length = 120, thickness = 36, label, color = 'var(--color-accent)', centerDetent, ticks = 0, className, disabled, capClassName }: FaderProps) {
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const vertical = orientation === 'vertical';
  const range = max - min;
  const norm = (value - min) / range;

  const setFromPointer = (e: { clientX: number; clientY: number }, fine = false, startVal?: number, startPos?: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let n: number;
    if (fine && startVal !== undefined && startPos !== undefined) {
      const dPx = vertical ? startPos - e.clientY : e.clientX - startPos;
      n = (startVal - min) / range + (dPx / (vertical ? rect.height : rect.width)) * 0.15;
    } else {
      n = vertical ? 1 - (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
    }
    n = Math.min(1, Math.max(0, n));
    let v = min + n * range;
    if (centerDetent) {
      const mid = min + range / 2;
      if (Math.abs(v - mid) < range * 0.025) v = mid;
    }
    onChange(v);
  };

  const start = useRef<{ v: number; p: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    if (disabled) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    start.current = { v: value, p: vertical ? e.clientY : e.clientX };
    setDragging(true);
    if (!e.shiftKey) setFromPointer(e);
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!dragging || disabled) return;
    setFromPointer(e, e.shiftKey, start.current?.v, start.current?.p);
  };
  const onPointerUp = (e: RPointerEvent) => {
    setDragging(false);
    start.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    const d = -Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.03) * range;
    onChange(Math.min(max, Math.max(min, value + d)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = range / 50;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(Math.min(max, value + s));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(Math.max(min, value - s));
    else return;
    e.preventDefault();
  };

  const capSize = vertical ? { width: thickness - 8, height: 22 } : { width: 22, height: thickness - 8 };
  const capPos = vertical ? { bottom: `calc(${norm * 100}% - 11px)`, left: 4 } : { left: `calc(${norm * 100}% - 11px)`, top: 4 };

  return (
    <div className={cn('flex flex-col items-center gap-1 select-none', disabled && 'opacity-40 pointer-events-none', className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation={orientation}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md touch-none cursor-pointer"
        style={vertical ? { width: thickness, height: length } : { width: length, height: thickness }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        {/* slot */}
        <div
          className="absolute rounded-full bg-bg"
          style={
            vertical
              ? { left: '50%', top: 6, bottom: 6, width: 4, transform: 'translateX(-50%)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)' }
              : { top: '50%', left: 6, right: 6, height: 4, transform: 'translateY(-50%)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)' }
          }
        />
        {/* ticks */}
        {ticks > 0 &&
          Array.from({ length: ticks }).map((_, i) => {
            const t = i / (ticks - 1);
            const isMid = ticks % 2 === 1 && i === (ticks - 1) / 2;
            return (
              <div
                key={i}
                className="absolute bg-border-2"
                style={
                  vertical
                    ? { left: isMid ? 2 : 6, right: isMid ? 2 : 6, height: 1, top: `calc(${(1 - t) * 100}% - 0.5px)` }
                    : { top: isMid ? 2 : 6, bottom: isMid ? 2 : 6, width: 1, left: `calc(${t * 100}% - 0.5px)` }
                }
              />
            );
          })}
        {/* cap */}
        <motion.div
          className={cn('absolute rounded-[4px]', capClassName)}
          style={{
            ...capSize,
            ...capPos,
            background: 'linear-gradient(180deg, #3a414d, #1c2028)',
            boxShadow: dragging ? `0 0 0 1px ${color}, 0 4px 12px rgba(0,0,0,0.7), 0 0 12px ${color}55` : '0 1px 0 rgba(255,255,255,0.08) inset, 0 3px 8px rgba(0,0,0,0.7)',
          }}
          animate={{ scale: dragging ? 1.06 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <div className={cn('absolute rounded-full', vertical ? 'left-1 right-1 top-1/2 h-[2px] -translate-y-1/2' : 'top-1 bottom-1 left-1/2 w-[2px] -translate-x-1/2')} style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
        </motion.div>
      </div>
      {label && <span className="text-[9px] uppercase tracking-wider text-text-dim">{label}</span>}
    </div>
  );
}
