/**
 * Response shapes of the FixFlow REST API (dates are ISO strings on the wire).
 * The API serializes exactly these shapes; the web client consumes them.
 */
import type {
  AssetStatus,
  AssignmentMethod,
  AttachmentKind,
  AutoAssignMode,
  Industry,
  LocationType,
  MembershipStatus,
  NotificationType,
  Priority,
  QrReportingMode,
  Role,
  SlaEventType,
  SubmissionOutcome,
  WorkOrderSource,
  WorkOrderStatus,
} from './enums.js';
import type { Permission } from './permissions.js';
import type { SlaClockState } from './sla.js';
import type { WorkOrderAction } from './workflow.js';
import type { CategoryColor, CategoryIcon } from './schemas/catalog.js';

export type ISODate = string;

export interface UserRef {
  id: string;
  name: string;
  email?: string;
}

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: Role;
}

export interface MeResponse {
  user: { id: string; name: string; email: string; phone: string | null; emailVerified: boolean };
  activeOrganization: {
    id: string;
    name: string;
    slug: string;
    industry: Industry;
    timezone: string;
    role: Role;
    permissions: Permission[];
    onboardingCompleted: boolean;
  } | null;
  memberships: MembershipSummary[];
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  industry: Industry;
  timezone: string;
  onboardingCompletedAt: ISODate | null;
  createdAt: ISODate;
  policy: {
    requesterCanVerify: boolean;
    technicianSelfAssign: boolean;
    requesterSeesAllOrgRequests: boolean;
    requireEvidencePhoto: boolean;
    reopenWindowDays: number;
    autoCloseDays: number;
    autoAssignMode: AutoAssignMode;
    qrReportingMode: QrReportingMode;
  };
}

export interface MemberDto {
  id: string; // membership id
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  jobTitle: string | null;
  isAvailable: boolean;
  openJobs: number;
  joinedAt: ISODate;
  lastLoginAt: ISODate | null;
  skills: { categoryId: string; categoryName: string; level: number }[];
}

export interface MemberProfileDto extends MemberDto {
  stats: {
    completedLast30d: number;
    avgResolutionMinutes: number | null;
    slaMetRate: number | null;
    reworkRate: number | null;
  };
  recentWorkOrders: WorkOrderSummary[];
}

export interface InvitationDto {
  id: string;
  email: string;
  role: Role;
  invitedBy: UserRef | null;
  createdAt: ISODate;
  expiresAt: ISODate;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  color: CategoryColor;
  icon: CategoryIcon;
  defaultChecklistTemplateId: string | null;
  archived: boolean;
  workOrderCount: number;
}

export interface LocationDto {
  id: string;
  name: string;
  type: LocationType;
  code: string | null;
  description: string | null;
  parentId: string | null;
  path: string; // "North Campus › Science Block › Floor 2"
  assetCount: number;
  openWorkOrders: number;
  archived: boolean;
}

export interface AssetSummary {
  id: string;
  name: string;
  assetTag: string;
  status: AssetStatus;
  category: { id: string; name: string; color: CategoryColor; icon: CategoryIcon };
  location: { id: string; name: string; path: string };
  openWorkOrders: number;
  lastServicedAt: ISODate | null;
}

export interface AssetDetail extends AssetSummary {
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installDate: ISODate | null;
  warrantyExpiresAt: ISODate | null;
  notes: string | null;
  createdAt: ISODate;
  stats: { totalWorkOrders: number; correctiveLast90d: number; avgResolutionMinutes: number | null };
}

export interface SlaClockDto {
  dueAt: ISODate;
  state: SlaClockState;
  completedAt: ISODate | null;
}

export interface WorkOrderSummary {
  id: string;
  number: number;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  source: WorkOrderSource;
  category: { id: string; name: string; color: CategoryColor; icon: CategoryIcon };
  location: { id: string; name: string; path: string } | null;
  asset: { id: string; name: string; assetTag: string } | null;
  requester: UserRef | null;
  guestName: string | null;
  assignee: UserRef | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  response: SlaClockDto;
  resolution: SlaClockDto;
  isOverdue: boolean;
  version: number;
}

export interface ChecklistItemDto {
  id: string;
  label: string;
  required: boolean;
  sortOrder: number;
  completedAt: ISODate | null;
  completedBy: UserRef | null;
}

export interface AttachmentDto {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedBy: UserRef | null;
  createdAt: ISODate;
  url: string;
  thumbnailUrl: string | null;
}

export interface SubmissionDto {
  id: string;
  notes: string;
  laborMinutes: number | null;
  partsUsed: string | null;
  submittedBy: UserRef;
  submittedAt: ISODate;
  outcome: SubmissionOutcome;
  reviewedBy: UserRef | null;
  reviewedAt: ISODate | null;
  reviewNote: string | null;
  attachments: AttachmentDto[];
}

export interface WorkOrderDetail extends WorkOrderSummary {
  description: string;
  guestContact: string | null;
  respondedAt: ISODate | null;
  resolvedAt: ISODate | null;
  verifiedAt: ISODate | null;
  closedAt: ISODate | null;
  cancelledAt: ISODate | null;
  reopenCount: number;
  reworkCount: number;
  escalationLevel: number;
  slaCycle: number;
  schedule: { id: string; title: string } | null;
  checklist: ChecklistItemDto[];
  attachments: AttachmentDto[];
  submissions: SubmissionDto[];
  availableActions: WorkOrderAction[];
  permissions: { canEdit: boolean; canComment: boolean; canInternalNote: boolean; canUpload: boolean; canEditChecklist: boolean };
}

export type TimelineEntry =
  | { kind: 'status'; id: string; at: ISODate; actor: UserRef | null; from: WorkOrderStatus | null; to: WorkOrderStatus; reason: string | null }
  | { kind: 'assignment'; id: string; at: ISODate; actor: UserRef | null; assignee: UserRef; method: AssignmentMethod }
  | { kind: 'comment'; id: string; at: ISODate; actor: UserRef | null; body: string; isInternal: boolean }
  | { kind: 'attachment'; id: string; at: ISODate; actor: UserRef | null; fileName: string; attachmentKind: AttachmentKind }
  | { kind: 'sla'; id: string; at: ISODate; type: SlaEventType; dueAt: ISODate }
  | { kind: 'submission'; id: string; at: ISODate; actor: UserRef; outcome: SubmissionOutcome }
  | { kind: 'update'; id: string; at: ISODate; actor: UserRef | null; changes: Record<string, { from: unknown; to: unknown }> };

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  workOrderId: string | null;
  workOrderNumber: number | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: UserRef | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: ISODate;
}

export interface SlaPolicyDto {
  priority: Priority;
  responseMinutes: number;
  resolutionMinutes: number;
  warningPercent: number;
  escalationEnabled: boolean;
  description: string;
}

export interface ChecklistTemplateDto {
  id: string;
  name: string;
  description: string | null;
  items: { id: string; label: string; required: boolean; sortOrder: number }[];
  usedByCategories: number;
}

export interface ScheduleDto {
  id: string;
  title: string;
  description: string | null;
  category: { id: string; name: string };
  priority: Priority;
  asset: { id: string; name: string; assetTag: string } | null;
  location: { id: string; name: string; path: string } | null;
  checklistTemplate: { id: string; name: string } | null;
  defaultAssignee: UserRef | null;
  frequencyUnit: 'DAY' | 'WEEK' | 'MONTH';
  frequencyInterval: number;
  startsAt: ISODate;
  nextDueAt: ISODate;
  leadTimeDays: number;
  lastGeneratedAt: ISODate | null;
  active: boolean;
}

export interface DashboardSummary {
  range: { from: ISODate; to: ISODate };
  totals: {
    total: number;
    open: number;
    inProgress: number;
    pendingVerification: number;
    resolved: number;
    overdue: number;
  };
  avgResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  slaCompliance: { response: number | null; resolution: number | null; overall: number | null };
  byPriority: { priority: Priority; open: number; total: number }[];
  volume: { date: string; created: number; resolved: number }[];
  technicianWorkload: { userId: string; name: string; assigned: number; inProgress: number; onHold: number; completed: number }[];
  recentActivity: { id: string; at: ISODate; actor: UserRef | null; summary: string; workOrderId: string | null; workOrderNumber: number | null }[];
}

export interface AnalyticsReport {
  range: { from: ISODate; to: ISODate };
  granularity: 'day' | 'week' | 'month';
  statusDistribution: { status: WorkOrderStatus; count: number }[];
  priorityDistribution: { priority: Priority; count: number }[];
  categoryDistribution: { categoryId: string; name: string; color: CategoryColor; count: number }[];
  trend: { bucket: string; created: number; resolved: number; avgResolutionMinutes: number | null }[];
  sla: { bucket: string; responseMet: number; responseMissed: number; resolutionMet: number; resolutionMissed: number }[];
  slaByPriority: { priority: Priority; responseRate: number | null; resolutionRate: number | null; total: number }[];
  technicians: { userId: string; name: string; completed: number; open: number; avgResolutionMinutes: number | null; slaMetRate: number | null; reworkRate: number | null }[];
  assetFailures: { assetId: string; name: string; assetTag: string; location: string; failures: number; lastFailureAt: ISODate }[];
}

export interface PublicReportContext {
  organizationName: string;
  qrReportingMode: QrReportingMode;
  target:
    | { kind: 'asset'; id: string; name: string; assetTag: string; locationName: string }
    | { kind: 'location'; id: string; name: string; path: string };
  categories: { id: string; name: string; icon: CategoryIcon; color: CategoryColor }[];
  defaultCategoryId: string | null;
}

export interface SearchResults {
  workOrders: { id: string; number: number; title: string; status: WorkOrderStatus }[];
  assets: { id: string; name: string; assetTag: string }[];
  locations: { id: string; name: string; path: string }[];
  people: { userId: string; name: string; role: Role }[];
}
