import { describe, expect, it } from 'vitest';
import {
  ROLES,
  can,
  computeSlaDeadlines,
  formatMinutes,
  formatWorkOrderNumber,
  nextOccurrenceAfter,
  occurrence,
  parseWorkOrderNumber,
  pickAutoAssignee,
  rankTechnicians,
  slaClockState,
  slaJobId,
  warningAt,
  type Permission,
} from '../src/index.js';

describe('permissions', () => {
  it('roles are strictly nested: requester ⊂ technician ⊂ manager ⊂ admin', () => {
    const order = ['REQUESTER', 'TECHNICIAN', 'MANAGER', 'ORG_ADMIN'] as const;
    const all: Permission[] = ['dashboard.read', 'workOrder.create', 'workOrder.readAssigned', 'workOrder.assign', 'org.settings'];
    for (let i = 0; i < order.length - 1; i++) {
      for (const p of all) {
        if (can(order[i]!, p)) expect(can(order[i + 1]!, p)).toBe(true);
      }
    }
  });

  it.each([
    ['REQUESTER', 'workOrder.readAll', false],
    ['TECHNICIAN', 'workOrder.assign', false],
    ['MANAGER', 'workOrder.assign', true],
    ['MANAGER', 'org.settings', false],
    ['MANAGER', 'audit.read', false],
    ['ORG_ADMIN', 'audit.read', true],
    ['TECHNICIAN', 'workOrder.internalNotes', true],
    ['REQUESTER', 'workOrder.internalNotes', false],
  ] as const)('%s → %s = %s', (role, perm, expected) => {
    expect(can(role, perm)).toBe(expected);
  });

  it('every role can create work orders', () => {
    for (const r of ROLES) expect(can(r, 'workOrder.create')).toBe(true);
  });
});

describe('SLA math', () => {
  const start = new Date('2026-03-01T08:00:00Z');

  it('computes deadlines from the cycle start', () => {
    const d = computeSlaDeadlines(start, { responseMinutes: 60, resolutionMinutes: 240, warningPercent: 75 });
    expect(d.responseDueAt.toISOString()).toBe('2026-03-01T09:00:00.000Z');
    expect(d.resolutionDueAt.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('warning fires at the configured share of the window', () => {
    expect(warningAt(start, new Date('2026-03-01T09:00:00Z'), 75).toISOString()).toBe('2026-03-01T08:45:00.000Z');
  });

  it('classifies clock states', () => {
    const due = new Date('2026-03-01T09:00:00Z');
    const base = { start, dueAt: due, warningPercent: 75 };
    expect(slaClockState({ ...base, completedAt: new Date('2026-03-01T08:59:59Z'), now: due })).toBe('MET');
    expect(slaClockState({ ...base, completedAt: new Date('2026-03-01T09:00:01Z'), now: due })).toBe('MISSED');
    expect(slaClockState({ ...base, completedAt: null, now: new Date('2026-03-01T08:10:00Z') })).toBe('ON_TRACK');
    expect(slaClockState({ ...base, completedAt: null, now: new Date('2026-03-01T08:50:00Z') })).toBe('AT_RISK');
    expect(slaClockState({ ...base, completedAt: null, now: new Date('2026-03-01T09:00:01Z') })).toBe('BREACHED');
    expect(slaClockState({ ...base, completedAt: null, now: new Date('2026-03-01T09:30:00Z'), stopped: true })).toBe('PAUSED');
  });

  it('job ids are deterministic so duplicate scheduling collapses', () => {
    const a = slaJobId('wo1', 'RESPONSE_BREACH', 0, new Date(1000));
    expect(a).toBe(slaJobId('wo1', 'RESPONSE_BREACH', 0, new Date(1000)));
    expect(a).not.toBe(slaJobId('wo1', 'RESPONSE_BREACH', 1, new Date(1000)));
    expect(a).not.toContain(':'); // BullMQ reserves ':' in custom job ids
  });

  it('formats durations compactly', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(60 * 26)).toBe('1d 2h');
  });
});

describe('technician ranking', () => {
  const hvac = 'cat-hvac';
  const candidates = [
    { userId: 'a', name: 'Asha', isAvailable: true, isActive: true, openJobs: 3, skills: [{ categoryId: hvac, level: 3 }] },
    { userId: 'b', name: 'Ben', isAvailable: true, isActive: true, openJobs: 0, skills: [{ categoryId: hvac, level: 1 }] },
    { userId: 'c', name: 'Chen', isAvailable: true, isActive: true, openJobs: 0, skills: [] },
    { userId: 'd', name: 'Dev', isAvailable: false, isActive: true, openJobs: 0, skills: [{ categoryId: hvac, level: 3 }] },
    { userId: 'e', name: 'Eli', isAvailable: true, isActive: false, openJobs: 0, skills: [{ categoryId: hvac, level: 3 }] },
  ];

  it('balances skill against workload and excludes unavailable/inactive people', () => {
    const ranked = rankTechnicians(candidates, hvac, 'HVAC');
    expect(ranked.map((r) => r.userId)).toEqual(['b', 'a', 'c']); // 50 vs 70-24=46 vs 0
    expect(ranked[0]!.reasons).toContain('HVAC skill · level 1');
  });

  it('auto-assign requires a skilled candidate', () => {
    expect(pickAutoAssignee(rankTechnicians(candidates, hvac))?.userId).toBe('b');
    expect(pickAutoAssignee(rankTechnicians(candidates, 'cat-plumbing'))).toBeNull();
  });
});

describe('recurrence', () => {
  it('monthly schedules anchored on the 31st clamp without drifting', () => {
    const anchor = new Date('2026-01-31T09:00:00Z');
    const months = [1, 2, 3].map((n) => occurrence(anchor, 'MONTH', 1, n, 'UTC').toISOString().slice(0, 10));
    expect(months).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('keeps local wall-clock time across DST in the org time zone', () => {
    // 09:00 in New York before and after the March 8, 2026 DST change.
    const anchor = new Date('2026-03-02T14:00:00Z'); // 09:00 EST
    const after = occurrence(anchor, 'WEEK', 1, 1, 'America/New_York'); // 09:00 EDT
    expect(after.toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });

  it('finds the next occurrence strictly after a moment', () => {
    const anchor = new Date('2026-01-01T06:00:00Z');
    expect(nextOccurrenceAfter(anchor, 'DAY', 3, new Date('2026-01-07T06:00:00Z'), 'UTC').toISOString()).toBe('2026-01-10T06:00:00.000Z');
    expect(nextOccurrenceAfter(anchor, 'WEEK', 2, new Date('2025-12-01T00:00:00Z'), 'UTC')).toEqual(anchor);
  });
});

describe('work order numbers', () => {
  it('formats and parses', () => {
    expect(formatWorkOrderNumber(42)).toBe('WO-0042');
    expect(parseWorkOrderNumber('wo-0042')).toBe(42);
    expect(parseWorkOrderNumber('1042')).toBe(1042);
    expect(parseWorkOrderNumber('abc')).toBeNull();
  });
});
