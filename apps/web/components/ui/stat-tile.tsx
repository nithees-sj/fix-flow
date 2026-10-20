import { cn } from '@/lib/utils';
import { Skeleton } from './display';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  loading?: boolean;
  href?: string;
}

const ICON_TONE = {
  default: 'bg-surface-muted text-ink-3',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  success: 'bg-success-soft text-success-ink',
};

/** KPI tile: sentence-case label, semibold value (auto-compact upstream), optional hint. */
export function StatTile({ label, value, hint, icon, tone = 'default', loading }: StatTileProps) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-ink-3">{label}</p>
        {icon && <span className={cn('hidden size-7 shrink-0 place-items-center rounded-lg sm:grid [&_svg]:size-4', ICON_TONE[tone])} aria-hidden>{icon}</span>}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </>
      ) : (
        <>
          <p className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-ink-3">{hint}</p>}
        </>
      )}
    </div>
  );
}
