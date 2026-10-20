import type { Priority, SlaEventType } from './enums.js';

/**
 * SLA definitions (documented in docs/PRD.md):
 *  - Response  = time from cycle start until the assigned technician first starts work.
 *  - Resolution = time from cycle start until the technician submits the resolution
 *                 that is later approved. Requester verification delay is not counted.
 * A "cycle" restarts when a work order is reopened. All instants are UTC.
 */

export interface SlaTargets {
  responseMinutes: number;
  resolutionMinutes: number;
  /** Percentage of the window after which a warning fires (e.g. 75). */
  warningPercent: number;
}

/** Example defaults offered during onboarding — every organization can change them. */
export const DEFAULT_SLA_TARGETS: Record<Priority, SlaTargets & { description: string }> = {
  CRITICAL: {
    responseMinutes: 60,
    resolutionMinutes: 4 * 60,
    warningPercent: 75,
    description: 'Safety risk or full outage affecting many people (e.g. flooding, power loss).',
  },
  HIGH: {
    responseMinutes: 4 * 60,
    resolutionMinutes: 24 * 60,
    warningPercent: 75,
    description: 'Significant disruption to a room or service (e.g. AC failure in a lecture hall).',
  },
  MEDIUM: {
    responseMinutes: 24 * 60,
    resolutionMinutes: 3 * 24 * 60,
    warningPercent: 80,
    description: 'Inconvenient but workable (e.g. flickering light, slow drain).',
  },
  LOW: {
    responseMinutes: 3 * 24 * 60,
    resolutionMinutes: 7 * 24 * 60,
    warningPercent: 80,
    description: 'Cosmetic or minor requests that can be scheduled.',
  },
};

const MIN = 60_000;

export interface SlaDeadlines {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

export function computeSlaDeadlines(cycleStart: Date, targets: SlaTargets): SlaDeadlines {
  return {
    responseDueAt: new Date(cycleStart.getTime() + targets.responseMinutes * MIN),
    resolutionDueAt: new Date(cycleStart.getTime() + targets.resolutionMinutes * MIN),
  };
}

/** Instant at which the warning for a window [start, due] fires. */
export function warningAt(start: Date, due: Date, warningPercent: number): Date {
  const span = due.getTime() - start.getTime();
  return new Date(start.getTime() + Math.floor((span * warningPercent) / 100));
}

export type SlaClockState = 'MET' | 'MISSED' | 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'PAUSED';

/**
 * State of one SLA clock.
 * @param completedAt when the clock stopped (respondedAt / approved submission time), if it has.
 * @param stopped     true when the clock is not running for other reasons (e.g. cancelled).
 */
export function slaClockState(params: {
  start: Date;
  dueAt: Date;
  completedAt: Date | null;
  warningPercent: number;
  now: Date;
  stopped?: boolean;
}): SlaClockState {
  const { start, dueAt, completedAt, warningPercent, now } = params;
  if (completedAt) return completedAt.getTime() <= dueAt.getTime() ? 'MET' : 'MISSED';
  if (params.stopped) return 'PAUSED';
  if (now.getTime() > dueAt.getTime()) return 'BREACHED';
  if (now.getTime() >= warningAt(start, dueAt, warningPercent).getTime()) return 'AT_RISK';
  return 'ON_TRACK';
}

/** Deterministic BullMQ job id: duplicates of the same logical check collapse into one job. */
export function slaJobId(workOrderId: string, type: SlaEventType, cycle: number, fireAt: Date): string {
  return `sla_${workOrderId}_${type}_${cycle}_${fireAt.getTime()}`;
}

export function formatMinutes(total: number): string {
  if (!Number.isFinite(total)) return '—';
  const minutes = Math.round(total);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}
