import type {
  AssetStatus,
  Industry,
  LocationType,
  NotificationType,
  Priority,
  WorkOrderSource,
  WorkOrderStatus,
} from './enums.js';

/** Tone keys map to design-system tints in the web app (see docs/UI_DESIGN_SYSTEM.md). */
export type Tone = 'neutral' | 'blue' | 'indigo' | 'amber' | 'violet' | 'green' | 'red' | 'teal' | 'slate';

export const STATUS_META: Record<WorkOrderStatus, { label: string; tone: Tone; description: string }> = {
  OPEN: { label: 'Open', tone: 'blue', description: 'Waiting to be assigned' },
  ASSIGNED: { label: 'Assigned', tone: 'indigo', description: 'Technician assigned, not started' },
  IN_PROGRESS: { label: 'In progress', tone: 'amber', description: 'Technician is working on it' },
  ON_HOLD: { label: 'On hold', tone: 'slate', description: 'Paused (e.g. waiting for parts)' },
  PENDING_VERIFICATION: { label: 'Pending verification', tone: 'violet', description: 'Awaiting review of the repair' },
  RESOLVED: { label: 'Resolved', tone: 'green', description: 'Repair verified' },
  CLOSED: { label: 'Closed', tone: 'neutral', description: 'Archived in history' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'No work required' },
};

export const PRIORITY_META: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  CRITICAL: { label: 'Critical', tone: 'red', rank: 0 },
  HIGH: { label: 'High', tone: 'amber', rank: 1 },
  MEDIUM: { label: 'Medium', tone: 'blue', rank: 2 },
  LOW: { label: 'Low', tone: 'slate', rank: 3 },
};

export const ASSET_STATUS_META: Record<AssetStatus, { label: string; tone: Tone }> = {
  OPERATIONAL: { label: 'Operational', tone: 'green' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'amber' },
  UNDER_MAINTENANCE: { label: 'Under maintenance', tone: 'blue' },
  OUT_OF_SERVICE: { label: 'Out of service', tone: 'red' },
  RETIRED: { label: 'Retired', tone: 'neutral' },
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  SITE: 'Site',
  BUILDING: 'Building',
  FLOOR: 'Floor',
  ROOM: 'Room',
  AREA: 'Area',
};

export const SOURCE_LABELS: Record<WorkOrderSource, string> = {
  WEB: 'Web request',
  QR: 'QR scan',
  GUEST_QR: 'Guest QR report',
  SCHEDULED: 'Preventive maintenance',
};

export const INDUSTRY_LABELS: Record<Industry, string> = {
  EDUCATION: 'Education & campuses',
  HEALTHCARE: 'Healthcare',
  RESIDENTIAL: 'Residential & apartments',
  OFFICE: 'Offices & workplaces',
  MANUFACTURING: 'Manufacturing & plants',
  RETAIL: 'Retail & malls',
  HOSPITALITY: 'Hospitality',
  OTHER: 'Other',
};

export const NOTIFICATION_TYPE_META: Record<NotificationType, { label: string; description: string }> = {
  WORK_ORDER_CREATED: { label: 'New requests', description: 'A new work order is reported in your organization' },
  WORK_ORDER_ASSIGNED: { label: 'Assignments', description: 'A work order is assigned to you' },
  WORK_ORDER_STATUS_CHANGED: { label: 'Status updates', description: 'Work orders you follow change status' },
  WORK_ORDER_COMMENT: { label: 'Comments', description: 'Someone comments on a work order you follow' },
  RESOLUTION_SUBMITTED: { label: 'Resolutions to review', description: 'A technician submits a repair for verification' },
  RESOLUTION_APPROVED: { label: 'Approved resolutions', description: 'Your submitted work is approved' },
  RESOLUTION_REJECTED: { label: 'Rejected resolutions', description: 'Your submitted work needs rework' },
  SLA_WARNING: { label: 'SLA warnings', description: 'A work order is close to missing its SLA' },
  SLA_BREACH: { label: 'SLA breaches & escalations', description: 'A work order missed its SLA target' },
  INVITATION: { label: 'Invitations', description: 'You are invited to an organization' },
  SCHEDULED_MAINTENANCE: { label: 'Preventive maintenance', description: 'Scheduled maintenance work is generated' },
};

export function formatWorkOrderNumber(n: number): string {
  return `WO-${String(n).padStart(4, '0')}`;
}

/** Parses "WO-0042", "wo-42" or "42" → 42. */
export function parseWorkOrderNumber(input: string): number | null {
  const m = /^(?:wo-?)?(\d{1,9})$/i.exec(input.trim());
  return m ? Number(m[1]) : null;
}
