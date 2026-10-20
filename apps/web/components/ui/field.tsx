import { Label as RadixLabel } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<typeof RadixLabel.Root>>(({ className, ...props }, ref) => (
  <RadixLabel.Root ref={ref} className={cn('text-[13px] font-medium text-ink-2 leading-none', className)} {...props} />
));
Label.displayName = 'Label';

interface FieldProps {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * Label + control + hint/error, wired for screen readers: the control should set
 * `aria-describedby={describedBy(id)}` and `aria-invalid={!!error}`.
 */
export function Field({ label, htmlFor, error, hint, optional, className, children, action }: FieldProps) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {optional && <span className="ml-1 font-normal text-ink-4">(optional)</span>}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const describedBy = (id: string, error?: string, hint?: unknown) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;
