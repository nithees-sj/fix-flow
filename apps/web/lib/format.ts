import { differenceInMinutes, format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';

export function formatDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  return iso ? format(new Date(iso), pattern) : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, 'HH:mm')}`;
  return format(d, 'd MMM yyyy, HH:mm');
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Math.abs(differenceInMinutes(new Date(), d)) < 1) return 'just now';
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/** "in 2h 10m" / "3h overdue" relative to now. */
export function dueIn(iso: string): { label: string; overdue: boolean } {
  const mins = differenceInMinutes(new Date(iso), new Date());
  const abs = Math.abs(mins);
  const span = abs < 60 ? `${abs}m` : abs < 1440 ? `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ''}` : `${Math.floor(abs / 1440)}d${Math.floor((abs % 1440) / 60) ? ` ${Math.floor((abs % 1440) / 60)}h` : ''}`;
  return mins >= 0 ? { label: `in ${span}`, overdue: false } : { label: `${span} overdue`, overdue: true };
}

export function percent(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "Campus › Building › Floor › Room" → last three segments for compact lists. */
export function shortPath(path: string | null | undefined, keep = 3): string {
  if (!path) return '';
  const parts = path.split(' › ');
  return parts.length > keep ? parts.slice(-keep).join(' › ') : path;
}
