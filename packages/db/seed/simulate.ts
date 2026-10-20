import { randomUUID } from 'node:crypto';
import {
  computeSlaDeadlines,
  DEFAULT_SLA_TARGETS,
  warningAt,
  type Priority,
  type WorkOrderStatus,
} from '@fixflow/shared';
import type { Rng } from './rng.js';

const MIN = 60_000;
const DAY = 86_400_000;

export interface SimPeople {
  managers: string[];
  technicians: { id: string; skills: Map<string, number>; available: boolean }[];
  requesters: string[];
}

export interface SimInput {
  createdAt: Date;
  priority: Priority;
  categoryId: string;
  categoryName: string;
  requesterId: string | null;
  scheduled: boolean;
  now: Date;
  checklistCount: number;
  /** Multiplies every delay; >1 keeps recent work in flight so the demo has a live backlog. */
  pace: number;
}

export interface SimStatus {
  from: WorkOrderStatus | null;
  to: WorkOrderStatus;
  at: Date;
  actorId: string | null;
  reason: string | null;
}

export interface SimSubmission {
  id: string;
  submittedById: string;
  submittedAt: Date;
  notes: string;
  laborMinutes: number;
  outcome: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface SimResult {
  status: WorkOrderStatus;
  assigneeId: string | null;
  slaCycle: number;
  cycleStartedAt: Date;
  responseDueAt: Date;
  resolutionDueAt: Date;
  warningPercent: number;
  respondedAt: Date | null;
  resolutionSubmittedAt: Date | null;
  resolvedAt: Date | null;
  verifiedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  reopenCount: number;
  reworkCount: number;
  escalationLevel: number;
  updatedAt: Date;
  history: SimStatus[];
  assignments: { assigneeId: string; assignedById: string | null; at: Date; unassignedAt: Date | null; method: 'MANUAL' | 'AUTO' | 'SELF' }[];
  submissions: SimSubmission[];
  checklistDoneAt: (Date | null)[];
  checklistDoneBy: string | null;
  slaEvents: { type: 'RESPONSE_WARNING' | 'RESPONSE_BREACH' | 'RESOLUTION_WARNING' | 'RESOLUTION_BREACH'; cycle: number; dueAt: Date; occurredAt: Date }[];
}

const RESOLUTION_NOTES = [
  'Diagnosed the fault, replaced the failed component and tested under load for 15 minutes.',
  'Cleaned and re-seated connections, replaced worn part and confirmed normal operation with the occupant.',
  'Isolated the supply, repaired the fitting and checked for leaks before restoring service.',
  'Reset and recalibrated the unit, updated settings and verified readings are within range.',
  'Replaced the damaged part from stock and tidied the work area.',
];
const REJECT_REASONS = ['Still happening intermittently this morning.', 'Fixed for a while, but the issue came back after an hour.', 'Area was left untidy and the noise continues.'];
const HOLD_REASONS = ['Waiting for a replacement part from the supplier.', 'Room in use — rescheduled with the occupant.', 'Awaiting contractor access approval.'];

/** Time windows (minutes) per priority: [assign, start, work]. */
const WINDOWS: Record<Priority, { assign: [number, number]; start: [number, number]; work: [number, number] }> = {
  CRITICAL: { assign: [3, 30], start: [5, 40], work: [30, 220] },
  HIGH: { assign: [10, 150], start: [15, 200], work: [60, 900] },
  MEDIUM: { assign: [30, 720], start: [30, 1200], work: [60, 2400] },
  LOW: { assign: [60, 2000], start: [60, 3000], work: [120, 4800] },
};

function pickTech(rng: Rng, people: SimPeople, categoryName: string): string {
  const skilled = people.technicians.filter((t) => t.available && t.skills.has(categoryName));
  const pool = skilled.length && rng.chance(0.85) ? skilled : people.technicians.filter((t) => t.available);
  return rng.pick(pool.length ? pool : people.technicians).id;
}

/**
 * Plays a work order forward through the real lifecycle until "now", producing internally
 * consistent rows (history, assignments, submissions, SLA events, timestamps).
 */
export function simulate(rng: Rng, input: SimInput, people: SimPeople): SimResult {
  const { now, priority } = input;
  const targets = DEFAULT_SLA_TARGETS[priority];
  const base = WINDOWS[priority];
  const k = input.pace;
  const w = {
    assign: [base.assign[0] * k, base.assign[1] * k] as [number, number],
    start: [base.start[0] * k, base.start[1] * k] as [number, number],
    work: [base.work[0] * k, base.work[1] * k] as [number, number],
  };
  const manager = () => rng.pick(people.managers);

  let cycle = 0;
  let cycleStart = input.createdAt;
  let deadlines = computeSlaDeadlines(cycleStart, targets);
  const r: SimResult = {
    status: 'OPEN',
    assigneeId: null,
    slaCycle: 0,
    cycleStartedAt: cycleStart,
    responseDueAt: deadlines.responseDueAt,
    resolutionDueAt: deadlines.resolutionDueAt,
    warningPercent: targets.warningPercent,
    respondedAt: null,
    resolutionSubmittedAt: null,
    resolvedAt: null,
    verifiedAt: null,
    closedAt: null,
    cancelledAt: null,
    reopenCount: 0,
    reworkCount: 0,
    escalationLevel: 0,
    updatedAt: input.createdAt,
    history: [{ from: null, to: 'OPEN', at: input.createdAt, actorId: input.requesterId, reason: null }],
    assignments: [],
    submissions: [],
    checklistDoneAt: Array.from({ length: input.checklistCount }, () => null),
    checklistDoneBy: null,
    slaEvents: [],
  };

  const move = (to: WorkOrderStatus, at: Date, actorId: string | null, reason: string | null = null) => {
    r.history.push({ from: r.status, to, at, actorId, reason });
    r.status = to;
    r.updatedAt = at;
  };

  const runCycle = (start: Date): boolean => {
    // Cancellation before anyone starts (duplicates, resolved by occupant…)
    if (cycle === 0 && rng.chance(0.04)) {
      const at = new Date(start.getTime() + rng.minutes(20, 600) * MIN);
      if (at > now) return false;
      const byRequester = !!input.requesterId && rng.chance(0.5);
      move('CANCELLED', at, byRequester ? input.requesterId : manager(), byRequester ? 'Resolved itself — no longer needed.' : 'Duplicate of an existing request.');
      r.cancelledAt = at;
      return false;
    }

    let t = new Date(start.getTime() + rng.minutes(...w.assign) * MIN);
    if (t > now) return false;
    const tech = cycle > 0 && r.assigneeId ? r.assigneeId : pickTech(rng, people, input.categoryName);
    if (cycle === 0 || !r.assigneeId) {
      const by = manager();
      r.assignments.push({ assigneeId: tech, assignedById: by, at: t, unassignedAt: null, method: 'MANUAL' });
      r.assigneeId = tech;
      move('ASSIGNED', t, by);
    }

    const late = rng.chance(priority === 'LOW' ? 0.08 : 0.14);
    t = new Date(t.getTime() + rng.minutes(...w.start) * (late ? 3.2 : 1) * MIN);
    if (t > now) return false;
    move('IN_PROGRESS', t, tech);
    r.respondedAt ??= t;
    r.checklistDoneBy = tech;

    let work = rng.minutes(...w.work) * (late ? 1.6 : 1);
    if (rng.chance(0.1)) {
      const holdAt = new Date(t.getTime() + work * 0.3 * MIN);
      if (holdAt > now) return false;
      move('ON_HOLD', holdAt, tech, rng.pick(HOLD_REASONS));
      const resumeAt = new Date(holdAt.getTime() + rng.minutes(120, 2880) * MIN);
      if (resumeAt > now) return false;
      move('IN_PROGRESS', resumeAt, tech);
      t = resumeAt;
      work *= 0.7;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const submitAt = new Date(t.getTime() + work * MIN);
      // Checklist items get completed while working.
      r.checklistDoneAt = r.checklistDoneAt.map((d, i) => {
        const at = new Date(t.getTime() + ((i + 1) / (r.checklistDoneAt.length + 1)) * work * MIN);
        return d ?? (at <= now ? at : null);
      });
      if (submitAt > now) return false;
      const sub: SimSubmission = {
        id: randomUUID(),
        submittedById: tech,
        submittedAt: submitAt,
        notes: rng.pick(RESOLUTION_NOTES),
        laborMinutes: Math.round(Math.min(work, 600)),
        outcome: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      };
      r.submissions.push(sub);
      move('PENDING_VERIFICATION', submitAt, tech);
      r.resolutionSubmittedAt = submitAt;

      const reviewAt = new Date(submitAt.getTime() + rng.minutes(20, 1800) * MIN);
      if (reviewAt > now) return false;
      const reviewer = input.requesterId && rng.chance(0.7) ? input.requesterId : manager();
      if (attempt === 0 && rng.chance(0.09)) {
        Object.assign(sub, { outcome: 'REJECTED', reviewedById: reviewer, reviewedAt: reviewAt, reviewNote: rng.pick(REJECT_REASONS) });
        move('IN_PROGRESS', reviewAt, reviewer, sub.reviewNote);
        r.resolutionSubmittedAt = null;
        r.reworkCount += 1;
        t = reviewAt;
        work = rng.minutes(60, 900);
        continue;
      }
      Object.assign(sub, { outcome: 'APPROVED', reviewedById: reviewer, reviewedAt: reviewAt });
      move('RESOLVED', reviewAt, reviewer);
      r.resolvedAt = reviewAt;
      r.verifiedAt = reviewAt;
      return true;
    }
    return false;
  };

  const finished = runCycle(cycleStart);
  if (finished && r.resolvedAt) {
    // Occasionally the problem comes back.
    if (rng.chance(0.035)) {
      const reopenAt = new Date(r.resolvedAt.getTime() + rng.minutes(240, 4000) * MIN);
      if (reopenAt < now) {
        recordSla(r, cycle);
        move('ASSIGNED', reopenAt, input.requesterId ?? manager(), 'The issue has come back.');
        cycle += 1;
        r.reopenCount += 1;
        cycleStart = reopenAt;
        deadlines = computeSlaDeadlines(cycleStart, targets);
        Object.assign(r, {
          slaCycle: cycle,
          cycleStartedAt: cycleStart,
          responseDueAt: deadlines.responseDueAt,
          resolutionDueAt: deadlines.resolutionDueAt,
          respondedAt: null,
          resolutionSubmittedAt: null,
          resolvedAt: null,
          verifiedAt: null,
        });
        runCycle(new Date(reopenAt.getTime() - w.assign[0] * MIN));
      }
    }
    // Auto-close a week after resolution.
    if (r.status === 'RESOLVED' && r.resolvedAt && r.resolvedAt.getTime() + 7 * DAY < now.getTime()) {
      const at = new Date(r.resolvedAt.getTime() + 7 * DAY);
      move('CLOSED', at, null, 'Automatically closed 7 days after verification');
      r.closedAt = at;
    }
  }
  recordSla(r, cycle, now);
  if (r.slaEvents.some((e) => e.type === 'RESOLUTION_BREACH' && e.cycle === cycle) && (priority === 'CRITICAL' || priority === 'HIGH')) {
    r.escalationLevel = 1;
  }
  return r;

  function recordSla(res: SimResult, c: number, at: Date = now) {
    if (res.status === 'CANCELLED') return;
    const start = res.cycleStartedAt;
    const respWarn = warningAt(start, res.responseDueAt, res.warningPercent);
    const respStop = res.respondedAt ?? at;
    if (respStop > respWarn) res.slaEvents.push({ type: 'RESPONSE_WARNING', cycle: c, dueAt: res.responseDueAt, occurredAt: respWarn });
    if (respStop > res.responseDueAt) res.slaEvents.push({ type: 'RESPONSE_BREACH', cycle: c, dueAt: res.responseDueAt, occurredAt: res.responseDueAt });
    const resWarn = warningAt(start, res.resolutionDueAt, res.warningPercent);
    const resStop = res.resolutionSubmittedAt ?? at;
    if (resStop > resWarn) res.slaEvents.push({ type: 'RESOLUTION_WARNING', cycle: c, dueAt: res.resolutionDueAt, occurredAt: resWarn });
    if (resStop > res.resolutionDueAt) res.slaEvents.push({ type: 'RESOLUTION_BREACH', cycle: c, dueAt: res.resolutionDueAt, occurredAt: res.resolutionDueAt });
  }
}
