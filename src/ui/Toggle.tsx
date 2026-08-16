import { motion } from 'motion/react';
import { cn } from './cn';

export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: string; className?: string }) {
  return (
    <label className={cn('inline-flex items-center gap-2 cursor-pointer select-none', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent', checked ? 'bg-accent/30 border-accent' : 'bg-panel-3 border-border')}
      >
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 30 }} className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full', checked ? 'bg-accent left-[18px]' : 'bg-text-dim left-0.5')} />
      </button>
      {label && <span className="text-xs text-text-dim">{label}</span>}
    </label>
  );
}
