/**
 * Domain enumerations shared by the API, worker and web app.
 * They mirror the Prisma enums one-to-one (a test in @fixflow/db asserts parity).
 */

const values = <const T extends readonly string[]>(...v: T) => v;

export const ROLES = values('ORG_ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER');
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUSES = values('ACTIVE', 'SUSPENDED');
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const INDUSTRIES = values(
  'EDUCATION',
  'HEALTHCARE',
  'RESIDENTIAL',
  'OFFICE',
  'MANUFACTURING',
  'RETAIL',
  'HOSPITALITY',
  'OTHER',
);
export type Industry = (typeof INDUSTRIES)[number];

export const WORK_ORDER_STATUSES = values(
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'PENDING_VERIFICATION',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
);
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/** Statuses in which a work order still needs work (counts toward workload & backlog). */
export const ACTIVE_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'PENDING_VERIFICATION',
] as const satisfies readonly WorkOrderStatus[];

/** Statuses a technician is actively responsible for. */
export const TECHNICIAN_WORKLOAD_STATUSES = [
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
] as const satisfies readonly WorkOrderStatus[];

export const TERMINAL_STATUSES = ['CLOSED', 'CANCELLED'] as const satisfies readonly WorkOrderStatus[];

export const PRIORITIES = values('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
export type Priority = (typeof PRIORITIES)[number];

export const WORK_ORDER_SOURCES = values('WEB', 'QR', 'GUEST_QR', 'SCHEDULED');
export type WorkOrderSource = (typeof WORK_ORDER_SOURCES)[number];

export const ASSET_STATUSES = values(
  'OPERATIONAL',
  'NEEDS_ATTENTION',
  'UNDER_MAINTENANCE',
  'OUT_OF_SERVICE',
  'RETIRED',
);
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const LOCATION_TYPES = values('SITE', 'BUILDING', 'FLOOR', 'ROOM', 'AREA');
export type LocationType = (typeof LOCATION_TYPES)[number];

/** Which location types may contain which. `null` = may be top-level. */
export const LOCATION_PARENT_RULES: Record<LocationType, readonly (LocationType | null)[]> = {
  SITE: [null],
  BUILDING: [null, 'SITE'],
  FLOOR: ['BUILDING'],
  ROOM: ['FLOOR', 'BUILDING'],
  AREA: [null, 'SITE', 'BUILDING', 'FLOOR'],
};

export const ATTACHMENT_KINDS = values('REPORT', 'PROGRESS', 'EVIDENCE');
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ASSIGNMENT_METHODS = values('MANUAL', 'AUTO', 'SELF');
export type AssignmentMethod = (typeof ASSIGNMENT_METHODS)[number];

export const SUBMISSION_OUTCOMES = values('PENDING', 'APPROVED', 'REJECTED');
export type SubmissionOutcome = (typeof SUBMISSION_OUTCOMES)[number];

export const SLA_EVENT_TYPES = values(
  'RESPONSE_WARNING',
  'RESPONSE_BREACH',
  'RESOLUTION_WARNING',
  'RESOLUTION_BREACH',
);
export type SlaEventType = (typeof SLA_EVENT_TYPES)[number];

export const NOTIFICATION_TYPES = values(
  'WORK_ORDER_CREATED',
  'WORK_ORDER_ASSIGNED',
  'WORK_ORDER_STATUS_CHANGED',
  'WORK_ORDER_COMMENT',
  'RESOLUTION_SUBMITTED',
  'RESOLUTION_APPROVED',
  'RESOLUTION_REJECTED',
  'SLA_WARNING',
  'SLA_BREACH',
  'INVITATION',
  'SCHEDULED_MAINTENANCE',
);
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const AUTO_ASSIGN_MODES = values('OFF', 'SUGGEST', 'AUTO');
export type AutoAssignMode = (typeof AUTO_ASSIGN_MODES)[number];

export const QR_REPORTING_MODES = values('AUTHENTICATED', 'PUBLIC');
export type QrReportingMode = (typeof QR_REPORTING_MODES)[number];

export const FREQUENCY_UNITS = values('DAY', 'WEEK', 'MONTH');
export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number];

export const OUTBOX_STATUSES = values('PENDING', 'DISPATCHED', 'DEAD');
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const USER_TOKEN_TYPES = values('PASSWORD_RESET', 'EMAIL_VERIFY');
export type UserTokenType = (typeof USER_TOKEN_TYPES)[number];
