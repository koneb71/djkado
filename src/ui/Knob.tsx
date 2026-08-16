import { useCallback, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { motion } from 'motion/react';
import { cn } from './cn';

export interface KnobProps {
  value: number; // in [min,max]
  min?: number;
  max?: number;
  defaultValue?: number; // reset on double-click
  onChange: (v: number) => void;
  size?: number;
  label?: string;
  color?: string; // arc color
  bipolar?: boolean; // arc drawn from center
  format?: (v: number) => string;
  className?: string;
  disabled?: boolean;
  step?: number;
}

const START = -135;
const END = 135;

/**
 * Rotary knob. Drag vertically (Shift = fine), wheel, arrow keys, double-click to reset.
 * Value → angle mapping is linear; the arc shows the value (from center when bipolar).
 */
export function Knob({ value, min = 0, max = 1, defaultValue, onChange, size = 44, label, color = 'var(--color-accent)', bipolar, format, className, disabled, step }: KnobProps) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const startRef = useRef<{ y: number; v: number } | null>(null);
  const range = max - min;
  const norm = (value - min) / range;
  const angle = START + norm * (END - START);
  const centerAngle = bipolar ? (START + END) / 2 : START;

  const clampV = (v: number) => Math.min(max, Math.max(min, v));

  const onPointerDown = (e: RPointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, v: value };
    setDragging(true);
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!startRef.current || disabled) return;
    const dy = startRef.current.y - e.clientY;
    const sens = (e.shiftKey ? 0.0008 : 0.006) * range;
    onChange(clampV(startRef.current.v + dy * sens));
  };
  const onPointerUp = (e: RPointerEvent) => {
    startRef.current = null;
    setDragging(false);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return;
      const d = -Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.03) * range;
      onChange(clampV(value + d));
    },
    [value, range, disabled, onChange, min, max], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = step ?? range / 50;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clampV(value + s));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clampV(value - s));
    else if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
    else return;
    e.preventDefault();
  };
  const reset = () => defaultValue !== undefined && onChange(defaultValue);

  const r = size / 2 - 3;
  const c = size / 2;
  const arc = describeArc(c, c, r, centerAngle, angle);
  const track = describeArc(c, c, r, START, END);
  const display = format ? format(value) : (Math.round(value * 100) / 100).toString();

  return (
    <div className={cn('flex flex-col items-center gap-1 select-none', disabled && 'opacity-40 pointer-events-none', className)}>
      <motion.div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full touch-none cursor-ns-resize"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onHoverStart={() => setHover(true)}
        onHoverEnd={() => setHover(false)}
        whileTap={{ scale: 0.96 }}
        animate={{ scale: dragging ? 1.04 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <svg width={size} height={size} className="absolute inset-0">
          <path d={track} stroke="var(--color-border-2)" strokeWidth={3} fill="none" strokeLinecap="round" />
          <path d={arc} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" style={{ filter: dragging || hover ? `drop-shadow(0 0 4px ${color})` : undefined }} />
        </svg>
        <div
          className="absolute rounded-full"
          style={{
            inset: 7,
            background: 'radial-gradient(circle at 35% 30%, #2b313c, #12151a 70%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.6)',
            transform: `rotate(${angle}deg)`,
          }}
        >
          <div className="absolute left-1/2 top-[3px] h-[32%] w-[2px] -translate-x-1/2 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
        </div>
        {(dragging || hover) && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-text shadow-lg z-20 pointer-events-none">
            {display}
          </motion.div>
        )}
      </motion.div>
      {label && <span className="text-[9px] uppercase tracking-wider text-text-dim">{label}</span>}
    </div>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const start = polar(cx, cy, r, Math.min(a0, a1));
  const end = polar(cx, cy, r, Math.max(a0, a1));
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}
