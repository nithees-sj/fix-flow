'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as C, Switch as Sw, Progress as P, Separator as Sep } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<React.ElementRef<typeof C.Root>, React.ComponentPropsWithoutRef<typeof C.Root>>(
  ({ className, ...props }, ref) => (
    <C.Root
      ref={ref}
      className={cn(
        'peer grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-surface shadow-xs transition-colors',
        'hover:border-ink-4 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-white',
        'data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=indeterminate]:text-white',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <C.Indicator>{props.checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
    </C.Root>
  ),
);
Checkbox.displayName = 'Checkbox';

export const Switch = React.forwardRef<React.ElementRef<typeof Sw.Root>, React.ComponentPropsWithoutRef<typeof Sw.Root>>(
  ({ className, ...props }, ref) => (
    <Sw.Root
      ref={ref}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-slate-300 p-0.5 transition-colors',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Sw.Thumb className="block size-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4" />
    </Sw.Root>
  ),
);
Switch.displayName = 'Switch';

export function Progress({ value, label, className, tone = 'brand' }: { value: number; label: string; className?: string; tone?: 'brand' | 'success' | 'warning' | 'danger' }) {
  const bar = { brand: 'bg-brand', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <P.Root value={value} aria-label={label} className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-muted', className)}>
      <P.Indicator className={cn('h-full rounded-full transition-[width] duration-300', bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </P.Root>
  );
}

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <Sep.Root
      orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    />
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] font-medium text-ink-3 shadow-xs', className)}>
      {children}
    </kbd>
  );
}
