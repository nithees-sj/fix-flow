import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldBase = [
  'w-full rounded-md border border-line bg-surface text-ink shadow-xs placeholder:text-ink-4',
  'transition-[border-color,box-shadow] duration-150',
  'hover:border-line-strong focus:border-brand focus:shadow-[var(--shadow-focus)] focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-3',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgb(220_38_38/0.18)]',
].join(' ');

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, leading, trailing, ...props }, ref) => {
  if (!leading && !trailing) {
    return <input ref={ref} className={cn(fieldBase, 'h-9 px-3 text-sm', className)} {...props} />;
  }
  return (
    <div className="relative flex items-center">
      {leading && <span className="pointer-events-none absolute left-3 flex text-ink-4 [&_svg]:size-4">{leading}</span>}
      <input ref={ref} className={cn(fieldBase, 'h-9 text-sm', leading ? 'pl-9' : 'pl-3', trailing ? 'pr-9' : 'pr-3', className)} {...props} />
      {trailing && <span className="absolute right-2 flex text-ink-3 [&_svg]:size-4">{trailing}</span>}
    </div>
  );
});
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(fieldBase, 'min-h-20 resize-y px-3 py-2 text-sm leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

/** Native select styled like the design system (used where a native picker is the better UX, e.g. mobile). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, 'h-9 appearance-none pl-3 pr-9 text-sm', className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
      </svg>
    </div>
  ),
);
NativeSelect.displayName = 'NativeSelect';
