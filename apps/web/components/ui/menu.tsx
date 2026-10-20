'use client';

import { DropdownMenu as DM, Popover as Pop, Tooltip as T, Tabs as Tb } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const panel = 'z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[side=bottom]:slide-in-from-top-1';

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;

export const MenuContent = React.forwardRef<React.ElementRef<typeof DM.Content>, React.ComponentPropsWithoutRef<typeof DM.Content>>(
  ({ className, sideOffset = 6, align = 'end', ...props }, ref) => (
    <DM.Portal>
      <DM.Content ref={ref} sideOffset={sideOffset} align={align} className={cn(panel, 'min-w-48 p-1', className)} {...props} />
    </DM.Portal>
  ),
);
MenuContent.displayName = 'MenuContent';

export const MenuItem = React.forwardRef<React.ElementRef<typeof DM.Item>, React.ComponentPropsWithoutRef<typeof DM.Item> & { tone?: 'default' | 'danger' }>(
  ({ className, tone = 'default', ...props }, ref) => (
    <DM.Item
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors [&_svg]:size-4 [&_svg]:text-ink-3',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        tone === 'danger' ? 'text-danger-ink data-[highlighted]:bg-danger-soft [&_svg]:text-danger' : 'text-ink data-[highlighted]:bg-surface-muted',
        className,
      )}
      {...props}
    />
  ),
);
MenuItem.displayName = 'MenuItem';

export const MenuLabel = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DM.Label>) => (
  <DM.Label className={cn('px-2.5 pb-1 pt-2 text-xs font-medium text-ink-3', className)} {...props} />
);
export const MenuSeparator = () => <DM.Separator className="-mx-1 my-1 h-px bg-line-subtle" />;

export const Popover = Pop.Root;
export const PopoverTrigger = Pop.Trigger;
export const PopoverContent = React.forwardRef<React.ElementRef<typeof Pop.Content>, React.ComponentPropsWithoutRef<typeof Pop.Content>>(
  ({ className, sideOffset = 6, align = 'start', ...props }, ref) => (
    <Pop.Portal>
      <Pop.Content ref={ref} sideOffset={sideOffset} align={align} className={cn(panel, 'w-72 p-3', className)} {...props} />
    </Pop.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';

export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0">
          {content}
          <T.Arrow className="fill-ink" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
export const TooltipProvider = T.Provider;

export const Tabs = Tb.Root;
export const TabsList = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Tb.List>) => (
  <Tb.List className={cn('flex items-center gap-1 border-b border-line', className)} {...props} />
);
export const TabsTrigger = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Tb.Trigger>) => (
  <Tb.Trigger
    className={cn(
      'relative -mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-3 transition-colors',
      'hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink focus-visible:outline-none focus-visible:bg-surface-muted',
      className,
    )}
    {...props}
  />
);
export const TabsContent = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Tb.Content>) => (
  <Tb.Content className={cn('pt-5 focus-visible:outline-none', className)} {...props} />
);

/** Compact pill segmented control (date ranges, view toggles). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'sm',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-line bg-surface-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 font-medium text-ink-3 transition-all hover:text-ink',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === o.value && 'bg-surface text-ink shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
