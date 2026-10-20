import {
  AlarmClock,
  Armchair,
  Building,
  CheckCircle2,
  CircleAlert,
  Clock3,
  DoorOpen,
  Droplets,
  Flame,
  Hammer,
  Lightbulb,
  Monitor,
  PauseCircle,
  Plug,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Trees,
  Wind,
  Wrench,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { PRIORITY_META, STATUS_META, type Priority, type SlaClockDto, type WorkOrderStatus } from '@fixflow/shared';
import { Badge } from '@/components/ui/display';
import { Tooltip } from '@/components/ui/menu';
import { dueIn, formatDateTime } from '@/lib/format';
import { CATEGORY_CHIP } from '@/lib/tone';
import { cn } from '@/lib/utils';

export function StatusBadge({ status, className }: { status: WorkOrderStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} dot className={className}>
      {m.label}
    </Badge>
  );
}

/** Priority uses shape + text, not color alone (bars fill by urgency). */
export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const m = PRIORITY_META[priority];
  const filled = 4 - m.rank;
  const color = { CRITICAL: 'bg-red-500', HIGH: 'bg-amber-500', MEDIUM: 'bg-blue-500', LOW: 'bg-slate-400' }[priority];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2">
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-[1px]', i < filled ? color : 'bg-slate-200')} style={{ height: 5 + i * 2.5 }} />
        ))}
      </span>
      {!compact && <span>{m.label}</span>}
      {compact && <span className="sr-only">{m.label} priority</span>}
    </span>
  );
}

/** The fixed category icon set (validated server-side against CATEGORY_ICONS). */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  wrench: Wrench,
  zap: Zap,
  droplets: Droplets,
  thermometer: Thermometer,
  wind: Wind,
  lightbulb: Lightbulb,
  monitor: Monitor,
  'shield-alert': ShieldAlert,
  hammer: Hammer,
  sparkles: Sparkles,
  trees: Trees,
  'door-open': DoorOpen,
  flame: Flame,
  plug: Plug,
  armchair: Armchair,
  building: Building,
};

export function CategoryChip({ category, showName = true }: { category: { name: string; color: string; icon: string }; showName?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
      <span className={cn('grid size-6 shrink-0 place-items-center rounded-md', CATEGORY_CHIP[category.color] ?? CATEGORY_CHIP.slate)} aria-hidden>
        <CategoryIcon name={category.icon} />
      </span>
      {showName && <span className="truncate">{category.name}</span>}
    </span>
  );
}

function CategoryIcon({ name }: { name: string }) {
  const Icon = CATEGORY_ICON_MAP[name] ?? Wrench;
  return <Icon className="size-3.5" />;
}

/** SLA clock: icon + text (never color alone), with the exact due time in a tooltip. */
export function SlaIndicator({ clock, label, size = 'sm' }: { clock: SlaClockDto; label: string; size?: 'sm' | 'md' }) {
  const due = dueIn(clock.dueAt);
  const cfg = {
    MET: { icon: <CheckCircle2 />, cls: 'text-success-ink', text: 'Met' },
    MISSED: { icon: <XCircle />, cls: 'text-danger-ink', text: 'Missed' },
    ON_TRACK: { icon: <Clock3 />, cls: 'text-ink-3', text: due.label },
    AT_RISK: { icon: <AlarmClock />, cls: 'text-warning-ink', text: due.label },
    BREACHED: { icon: <CircleAlert />, cls: 'text-danger-ink font-medium', text: due.label },
    PAUSED: { icon: <PauseCircle />, cls: 'text-ink-4', text: '—' },
  }[clock.state];
  return (
    <Tooltip content={`${label} due ${formatDateTime(clock.dueAt)}${clock.completedAt ? ` · completed ${formatDateTime(clock.completedAt)}` : ''}`}>
      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', size === 'sm' ? 'text-xs [&_svg]:size-3.5' : 'text-[13px] [&_svg]:size-4', cfg.cls)}>
        {cfg.icon}
        <span>
          <span className="sr-only">{label}: </span>
          {cfg.text}
        </span>
      </span>
    </Tooltip>
  );
}
