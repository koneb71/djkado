import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from './cn';

type Variant = 'default' | 'ghost' | 'primary' | 'danger' | 'pad';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
  activeColor?: string; // css color for glow when active
  children?: ReactNode;
  square?: boolean;
  title?: string;
}

const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-[10px] rounded',
  sm: 'h-7 px-2.5 text-[11px] rounded-md',
  md: 'h-9 px-3 text-xs rounded-md',
  lg: 'h-11 px-4 text-sm rounded-lg',
};

/** Momentary/toggle button with tactile press animation and optional colored active glow. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'default', size = 'md', active, activeColor, className, children, square, style, ...rest }, ref) {
  const base = 'relative inline-flex items-center justify-center gap-1.5 font-semibold uppercase tracking-wide select-none outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:pointer-events-none transition-colors';
  const variants: Record<Variant, string> = {
    default: 'bg-panel-3 text-text-dim border border-border hover:text-text hover:border-border-2',
    ghost: 'bg-transparent text-text-dim hover:text-text hover:bg-panel-3',
    primary: 'bg-accent text-bg border border-accent hover:brightness-110',
    danger: 'bg-danger/20 text-danger border border-danger/40 hover:bg-danger/30',
    pad: 'bg-panel-2 text-text-dim border border-border hover:border-border-2',
  };
  const activeStyle = active && activeColor ? { color: activeColor, borderColor: activeColor, boxShadow: `0 0 12px ${activeColor}66, inset 0 0 8px ${activeColor}22`, background: `${activeColor}1a` } : undefined;
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(base, sizes[size], variants[variant], square && 'px-0 aspect-square', active && !activeColor && 'text-text border-border-2 bg-panel-3', className)}
      style={{ ...activeStyle, ...style }}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
