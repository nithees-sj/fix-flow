import { AlarmClock, CalendarClock, CheckCircle2, ClipboardPlus, MessageSquare, RefreshCw, ShieldAlert, UserPlus, Wrench, XCircle } from 'lucide-react';
import type { NotificationType } from '@fixflow/shared';
import { cn } from '@/lib/utils';

const MAP: Record<NotificationType, { icon: React.ReactNode; tone: string }> = {
  WORK_ORDER_CREATED: { icon: <ClipboardPlus />, tone: 'bg-blue-50 text-blue-700' },
  WORK_ORDER_ASSIGNED: { icon: <Wrench />, tone: 'bg-indigo-50 text-indigo-700' },
  WORK_ORDER_STATUS_CHANGED: { icon: <RefreshCw />, tone: 'bg-slate-100 text-slate-700' },
  WORK_ORDER_COMMENT: { icon: <MessageSquare />, tone: 'bg-slate-100 text-slate-700' },
  RESOLUTION_SUBMITTED: { icon: <CheckCircle2 />, tone: 'bg-violet-50 text-violet-700' },
  RESOLUTION_APPROVED: { icon: <CheckCircle2 />, tone: 'bg-emerald-50 text-emerald-700' },
  RESOLUTION_REJECTED: { icon: <XCircle />, tone: 'bg-red-50 text-red-700' },
  SLA_WARNING: { icon: <AlarmClock />, tone: 'bg-amber-50 text-amber-700' },
  SLA_BREACH: { icon: <ShieldAlert />, tone: 'bg-red-50 text-red-700' },
  INVITATION: { icon: <UserPlus />, tone: 'bg-teal-50 text-teal-700' },
  SCHEDULED_MAINTENANCE: { icon: <CalendarClock />, tone: 'bg-teal-50 text-teal-700' },
};

export function NotificationIcon({ type, className }: { type: NotificationType; className?: string }) {
  const m = MAP[type];
  return <span className={cn('grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4', m.tone, className)}>{m.icon}</span>;
}
