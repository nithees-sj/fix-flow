import type { Tone } from '@fixflow/shared';
import * as React from 'react';
import { TONE_DOT, TONE_PILL } from '@/lib/tone';
import { avatarTint, cn, initials } from '@/lib/utils';

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium ring-1 ring-inset', TONE_PILL[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface shadow-xs', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pb-3 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-11 text-sm' }[size];
  return (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold', avatarTint(name), s, className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function PersonChip({ name, sub, size = 'sm' }: { name: string; sub?: React.ReactNode; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-ink">{name}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink-3 shadow-xs [&_svg]:size-5">{icon}</div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-3">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink tabular">{value}</dd>
      {sub && <dd className="text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

export function DescriptionList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4', className)}>{children}</dl>;
}
