import { cn } from './cn';

export function Led({ on, color = 'var(--color-accent)', size = 8, className }: { on: boolean; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full transition-all duration-75', className)}
      style={{
        width: size,
        height: size,
        background: on ? color : '#1a1e26',
        boxShadow: on ? `0 0 ${size}px ${color}, 0 0 2px ${color}` : 'inset 0 1px 2px rgba(0,0,0,0.8)',
      }}
    />
  );
}
