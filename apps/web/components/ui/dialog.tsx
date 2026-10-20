'use client';

import { X } from 'lucide-react';
import { AlertDialog as AD, Dialog as D } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlay = 'fixed inset-0 z-50 bg-overlay backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof D.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  hideClose?: boolean;
}

export const DialogContent = React.forwardRef<React.ElementRef<typeof D.Content>, DialogContentProps>(
  ({ className, title, description, size = 'md', footer, hideClose, children, ...props }, ref) => (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-lg',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 pb-4 pt-5">
          <div className="min-w-0">
            <D.Title className="text-base font-semibold text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[13px] text-ink-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-1">
                <X />
              </Button>
            </D.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line-subtle px-5 py-3.5 sm:flex-row sm:justify-end">{footer}</div>}
      </D.Content>
    </D.Portal>
  ),
);
DialogContent.displayName = 'DialogContent';

/** Right-side drawer (filters, quick views). Becomes a bottom sheet on small screens. */
export const SheetContent = React.forwardRef<React.ElementRef<typeof D.Content>, DialogContentProps & { side?: 'right' | 'bottom' }>(
  ({ className, title, description, footer, children, side = 'right', ...props }, ref) => (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col border-line bg-surface shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'right'
            ? 'inset-y-0 right-0 w-full max-w-md border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right'
            : 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
          <div>
            <D.Title className="text-base font-semibold">{title}</D.Title>
            <D.Description className={description ? 'mt-1 text-[13px] text-ink-3' : 'sr-only'}>{description ?? 'Panel'}</D.Description>
          </div>
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line-subtle px-5 py-3.5 safe-bottom">{footer}</div>}
      </D.Content>
    </D.Portal>
  ),
);
SheetContent.displayName = 'SheetContent';

interface ConfirmProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}

/** Accessible confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'primary', loading, onConfirm, children }: ConfirmProps) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <AD.Title className="text-base font-semibold">{title}</AD.Title>
          <AD.Description className="mt-2 text-sm text-ink-3">{description}</AD.Description>
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AD.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AD.Cancel>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
