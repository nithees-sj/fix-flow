import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
    'disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
    'focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[var(--shadow-focus)]',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-white shadow-xs hover:bg-brand-hover active:bg-brand-active [box-shadow:inset_0_1px_0_rgb(255_255_255/0.12),var(--shadow-xs)]',
        secondary: 'border border-line bg-surface text-ink shadow-xs hover:bg-surface-muted hover:border-line-strong',
        ghost: 'text-ink-2 hover:bg-surface-muted hover:text-ink',
        subtle: 'bg-surface-muted text-ink hover:bg-slate-200/70',
        danger: 'bg-danger text-white shadow-xs hover:bg-danger-ink',
        'danger-ghost': 'text-danger-ink hover:bg-danger-soft',
        link: 'h-auto px-0 text-brand-ink underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-7 px-2 text-xs [&_svg]:size-3.5',
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-4',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-[15px] [&_svg]:size-[18px]',
        icon: 'size-9 [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-4',
        'icon-xs': 'size-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Spinner className="size-4" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
