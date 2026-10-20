import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, addWeeks, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export type Granularity = 'day' | 'week' | 'month';

export function granularityFor(from: Date, to: Date): Granularity {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
}

/** Bucket keys (yyyy-MM-dd of the bucket start, in the org's time zone), matching SQL date_trunc. */
export function bucketKeys(from: Date, to: Date, timeZone: string, unit: Granularity): string[] {
  const start = (d: Date) => {
    const local = new TZDate(d.getTime(), timeZone);
    return unit === 'day' ? startOfDay(local) : unit === 'week' ? startOfWeek(local, { weekStartsOn: 1 }) : startOfMonth(local);
  };
  const step = (d: Date) => (unit === 'day' ? addDays(d, 1) : unit === 'week' ? addWeeks(d, 1) : addMonths(d, 1));
  const keys: string[] = [];
  let cur = start(from);
  const end = to.getTime();
  for (let i = 0; cur.getTime() <= end && i < 1000; i++) {
    keys.push(format(cur, 'yyyy-MM-dd'));
    cur = step(cur) as typeof cur;
  }
  return keys;
}
