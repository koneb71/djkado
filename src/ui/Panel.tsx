import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Panel({ className, children, inset, ...rest }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode; inset?: boolean }) {
  return (
    <div className={cn(inset ? 'panel-inset' : 'panel', 'relative', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[9px] font-semibold uppercase tracking-[0.18em] text-text-faint', className)}>{children}</div>;
}
