import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, addWeeks } from 'date-fns';
import type { FrequencyUnit } from './enums.js';

/**
 * Preventive-maintenance recurrence.
 *
 * Occurrences are always computed from the schedule's anchor (`n` intervals after it) in
 * the organization's time zone, so month-end clamping never drifts (Jan 31 → Feb 28 → Mar 31)
 * and wall-clock times survive DST changes.
 */
export function occurrence(
  anchor: Date,
  unit: FrequencyUnit,
  interval: number,
  n: number,
  timeZone: string,
): Date {
  const local = new TZDate(anchor.getTime(), timeZone);
  const steps = interval * n;
  const next = unit === 'DAY' ? addDays(local, steps) : unit === 'WEEK' ? addWeeks(local, steps) : addMonths(local, steps);
  return new Date(next.getTime());
}

/** First occurrence strictly after `after` (or the anchor itself if it is later). */
export function nextOccurrenceAfter(
  anchor: Date,
  unit: FrequencyUnit,
  interval: number,
  after: Date,
  timeZone: string,
): Date {
  if (interval < 1) throw new RangeError('interval must be ≥ 1');
  if (anchor.getTime() > after.getTime()) return anchor;
  // Estimate n, then walk forward; bounded because estimates are within a couple of steps.
  const approxDays = unit === 'DAY' ? interval : unit === 'WEEK' ? interval * 7 : interval * 28;
  let n = Math.max(0, Math.floor((after.getTime() - anchor.getTime()) / (approxDays * 86_400_000)) - 2);
  let candidate = occurrence(anchor, unit, interval, n, timeZone);
  while (candidate.getTime() <= after.getTime()) {
    n += 1;
    candidate = occurrence(anchor, unit, interval, n, timeZone);
  }
  return candidate;
}

export function describeFrequency(unit: FrequencyUnit, interval: number): string {
  const word = unit === 'DAY' ? 'day' : unit === 'WEEK' ? 'week' : 'month';
  if (interval === 1) return unit === 'DAY' ? 'Daily' : unit === 'WEEK' ? 'Weekly' : 'Monthly';
  return `Every ${interval} ${word}s`;
}
