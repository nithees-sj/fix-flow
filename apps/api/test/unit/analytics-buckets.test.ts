import { describe, expect, it } from 'vitest';
import { bucketKeys, granularityFor } from '../../src/modules/analytics/buckets.js';

describe('analytics buckets', () => {
  it('picks granularity from the range length', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(granularityFor(from, new Date('2026-01-31T00:00:00Z'))).toBe('day');
    expect(granularityFor(from, new Date('2026-04-30T00:00:00Z'))).toBe('week');
    expect(granularityFor(from, new Date('2026-12-31T00:00:00Z'))).toBe('month');
  });

  it('buckets days in the organization time zone, not UTC', () => {
    // 23:30 UTC on Mar 1 is already Mar 2 in Kolkata (+05:30).
    const keys = bucketKeys(new Date('2026-03-01T23:30:00Z'), new Date('2026-03-03T12:00:00Z'), 'Asia/Kolkata', 'day');
    expect(keys).toEqual(['2026-03-02', '2026-03-03']);
    const utc = bucketKeys(new Date('2026-03-01T23:30:00Z'), new Date('2026-03-03T12:00:00Z'), 'UTC', 'day');
    expect(utc).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('starts weeks on Monday like Postgres date_trunc(week)', () => {
    // 2026-03-04 is a Wednesday → bucket starts Monday 2026-03-02.
    const keys = bucketKeys(new Date('2026-03-04T12:00:00Z'), new Date('2026-03-20T12:00:00Z'), 'UTC', 'week');
    expect(keys).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
  });

  it('produces one key per calendar month across year boundaries', () => {
    const keys = bucketKeys(new Date('2025-11-15T00:00:00Z'), new Date('2026-02-10T00:00:00Z'), 'America/New_York', 'month');
    expect(keys).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('handles DST transitions without skipping or duplicating days', () => {
    // US DST starts 2026-03-08.
    const keys = bucketKeys(new Date('2026-03-07T12:00:00Z'), new Date('2026-03-10T12:00:00Z'), 'America/New_York', 'day');
    expect(keys).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });
});
