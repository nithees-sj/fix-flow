import { Inject, Injectable } from '@nestjs/common';
import type { Database, Prisma, Tx } from '@fixflow/db';
import {
  ACTIVE_STATUSES,
  getAvailableActions,
  slaClockState,
  type AttachmentDto,
  type CategoryColor,
  type CategoryIcon,
  type Paginated,
  type WorkOrderDetail,
  type WorkOrderListQuery,
  type WorkOrderSummary,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { notFound } from '../../common/errors.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { workOrderVisibility } from './access.js';
import { loadPolicy, type OrgPolicy } from './policy.js';

export const summaryInclude = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  location: { select: { id: true, name: true } },
  asset: { select: { id: true, name: true, assetTag: true } },
  requester: { select: { user: { select: { id: true, name: true } } } },
  assignee: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.WorkOrderInclude;

export type SummaryRow = Prisma.WorkOrderGetPayload<{ include: typeof summaryInclude }>;

const attachmentInclude = { uploadedBy: { select: { id: true, name: true } } } satisfies Prisma.AttachmentInclude;
type AttachmentRow = Prisma.AttachmentGetPayload<{ include: typeof attachmentInclude }>;

export function toAttachmentDto(a: AttachmentRow): AttachmentDto {
  return {
    id: a.id,
    kind: a.kind,
    fileName: a.fileName,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    uploadedBy: a.uploadedBy ? { id: a.uploadedBy.id, name: a.uploadedBy.name } : null,
    createdAt: a.createdAt.toISOString(),
    url: `/api/v1/attachments/${a.id}/content`,
    thumbnailUrl: a.thumbnailKey ? `/api/v1/attachments/${a.id}/content?variant=thumb` : null,
  };
}

const ACTIVE = new Set<string>(ACTIVE_STATUSES);

export function isOverdue(w: Pick<SummaryRow, 'status' | 'respondedAt' | 'responseDueAt' | 'resolutionSubmittedAt' | 'resolutionDueAt'>, now: Date): boolean {
  if (!ACTIVE.has(w.status)) return false;
  return (!w.respondedAt && w.responseDueAt < now) || (!w.resolutionSubmittedAt && w.resolutionDueAt < now);
}

/** Prisma filter equivalent of `isOverdue` (used for the "Overdue" list filter and counts). */
export function overdueWhere(now: Date): Prisma.WorkOrderWhereInput {
  return {
    status: { in: [...ACTIVE_STATUSES] },
    OR: [
      { respondedAt: null, responseDueAt: { lt: now } },
      { resolutionSubmittedAt: null, resolutionDueAt: { lt: now } },
    ],
  };
}

export function toSummary(w: SummaryRow, locations: LocationIndex, now: Date): WorkOrderSummary {
  const stopped = w.status === 'CANCELLED' || w.status === 'CLOSED' || w.status === 'RESOLVED';
  return {
    id: w.id,
    number: w.number,
    title: w.title,
    status: w.status,
    priority: w.priority,
    source: w.source,
    category: { id: w.category.id, name: w.category.name, color: w.category.color as CategoryColor, icon: w.category.icon as CategoryIcon },
    location: w.location ? { id: w.location.id, name: w.location.name, path: locations.path(w.location.id) } : null,
    asset: w.asset,
    requester: w.requester ? { id: w.requester.user.id, name: w.requester.user.name } : null,
    guestName: w.guestName,
    assignee: w.assignee ? { id: w.assignee.user.id, name: w.assignee.user.name } : null,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    response: {
      dueAt: w.responseDueAt.toISOString(),
      completedAt: w.respondedAt?.toISOString() ?? null,
      state: slaClockState({
        start: w.cycleStartedAt,
        dueAt: w.responseDueAt,
        completedAt: w.respondedAt,
        warningPercent: w.slaWarningPercent,
        now,
        stopped: stopped || w.status === 'CANCELLED',
      }),
    },
    resolution: {
      dueAt: w.resolutionDueAt.toISOString(),
      completedAt: w.resolutionSubmittedAt?.toISOString() ?? null,
      state: slaClockState({
        start: w.cycleStartedAt,
        dueAt: w.resolutionDueAt,
        completedAt: w.resolutionSubmittedAt,
        warningPercent: w.slaWarningPercent,
        now,
        stopped: w.status === 'CANCELLED',
      }),
    },
    isOverdue: isOverdue(w, now),
    version: w.version,
  };
}

const PRIORITY_ORDER = (order: 'asc' | 'desc'): Prisma.WorkOrderOrderByWithRelationInput[] =>
  // Enum order in Postgres follows declaration (CRITICAL first); "desc" = most urgent first.
  [{ priority: order === 'desc' ? 'asc' : 'desc' }, { createdAt: 'desc' }];

@Injectable()
export class WorkOrderQueryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listSummaries(
    tx: Tx,
    organizationId: string,
    args: { where?: Prisma.WorkOrderWhereInput; orderBy?: Prisma.WorkOrderOrderByWithRelationInput | Prisma.WorkOrderOrderByWithRelationInput[]; take?: number; skip?: number },
    locations?: LocationIndex,
  ): Promise<WorkOrderSummary[]> {
    const rows = await tx.workOrder.findMany({
      where: { organizationId, ...args.where },
      include: summaryInclude,
      orderBy: args.orderBy ?? { createdAt: 'desc' },
      take: args.take,
      skip: args.skip,
    });
    const idx = locations ?? (await LocationIndex.load(tx, organizationId));
    const now = new Date();
    return rows.map((r) => toSummary(r, idx, now));
  }

  buildWhere(actor: Actor, policy: OrgPolicy, q: WorkOrderListQuery, locations: LocationIndex): Prisma.WorkOrderWhereInput {
    const now = new Date();
    const and: Prisma.WorkOrderWhereInput[] = [{ organizationId: actor.organizationId }, workOrderVisibility(actor, policy)];
    if (q.status?.length) and.push({ status: { in: q.status } });
    if (q.priority?.length) and.push({ priority: { in: q.priority } });
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.assigneeId === 'me') and.push({ assigneeId: actor.userId });
    else if (q.assigneeId === 'unassigned') and.push({ assigneeId: null });
    else if (q.assigneeId) and.push({ assigneeId: q.assigneeId });
    if (q.requesterId === 'me') and.push({ requesterId: actor.userId });
    else if (q.requesterId) and.push({ requesterId: q.requesterId });
    if (q.locationId) {
      const ids = locations.subtree(q.locationId);
      and.push({ OR: [{ locationId: { in: ids } }, { asset: { locationId: { in: ids } } }] });
    }
    if (q.assetId) and.push({ assetId: q.assetId });
    if (q.overdue) and.push(overdueWhere(now));
    if (q.createdFrom || q.createdTo) {
      and.push({ createdAt: { ...(q.createdFrom ? { gte: new Date(q.createdFrom) } : {}), ...(q.createdTo ? { lte: new Date(q.createdTo) } : {}) } });
    }
    if (q.q) {
      const n = /^(?:wo-?)?(\d{1,9})$/i.exec(q.q)?.[1];
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
          { asset: { assetTag: { contains: q.q, mode: 'insensitive' } } },
          ...(n ? [{ number: Number(n) }] : []),
        ],
      });
    }
    return { AND: and };
  }

  async list(actor: Actor, q: WorkOrderListQuery): Promise<Paginated<WorkOrderSummary>> {
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const locations = await LocationIndex.load(tx, actor.organizationId);
      const where = this.buildWhere(actor, policy, q, locations);
      const orderBy: Prisma.WorkOrderOrderByWithRelationInput | Prisma.WorkOrderOrderByWithRelationInput[] =
        q.sort === 'priority' ? PRIORITY_ORDER(q.order) : [{ [q.sort]: q.order }, { number: 'desc' }];
      const [data, total] = await Promise.all([
        this.listSummaries(tx, actor.organizationId, { where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }, locations),
        tx.workOrder.count({ where }),
      ]);
      return { data, meta: { page: q.page, pageSize: q.pageSize, total, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) } };
    });
  }

  /** Loads a work order the actor may see, or throws 404 (also for other tenants' ids). */
  async findVisible(tx: Tx, actor: Actor, policy: OrgPolicy, id: string) {
    const wo = await tx.workOrder.findFirst({
      where: { id, organizationId: actor.organizationId, ...workOrderVisibility(actor, policy) },
      include: summaryInclude,
    });
    if (!wo) throw notFound('Work order');
    return wo;
  }

  async detail(tx: Tx, actor: Actor, id: string): Promise<WorkOrderDetail> {
    const policy = await loadPolicy(tx, actor.organizationId);
    const wo = await this.findVisible(tx, actor, policy, id);
    const [checklist, attachments, submissions, schedule, locations] = await Promise.all([
      tx.workOrderChecklistItem.findMany({
        where: { organizationId: actor.organizationId, workOrderId: id },
        orderBy: { sortOrder: 'asc' },
        include: { completedBy: { select: { id: true, name: true } } },
      }),
      tx.attachment.findMany({
        where: { organizationId: actor.organizationId, workOrderId: id },
        orderBy: { createdAt: 'asc' },
        include: attachmentInclude,
      }),
      tx.resolutionSubmission.findMany({
        where: { organizationId: actor.organizationId, workOrderId: id },
        orderBy: { submittedAt: 'desc' },
        include: {
          submittedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
          attachments: { include: attachmentInclude, orderBy: { createdAt: 'asc' } },
        },
      }),
      wo.scheduleId
        ? tx.maintenanceSchedule.findFirst({ where: { id: wo.scheduleId, organizationId: actor.organizationId }, select: { id: true, title: true } })
        : null,
      LocationIndex.load(tx, actor.organizationId),
    ]);

    const now = new Date();
    const isStaff = actor.role !== 'REQUESTER';
    const isManager = actor.role === 'MANAGER' || actor.role === 'ORG_ADMIN';
    const isAssignee = wo.assigneeId === actor.userId;
    const isRequester = wo.requesterId === actor.userId;
    const active = ACTIVE.has(wo.status);

    return {
      ...toSummary(wo, locations, now),
      description: wo.description,
      guestContact: isStaff ? wo.guestContact : null,
      respondedAt: wo.respondedAt?.toISOString() ?? null,
      resolvedAt: wo.resolvedAt?.toISOString() ?? null,
      verifiedAt: wo.verifiedAt?.toISOString() ?? null,
      closedAt: wo.closedAt?.toISOString() ?? null,
      cancelledAt: wo.cancelledAt?.toISOString() ?? null,
      reopenCount: wo.reopenCount,
      reworkCount: wo.reworkCount,
      escalationLevel: wo.escalationLevel,
      slaCycle: wo.slaCycle,
      schedule,
      checklist: checklist.map((c) => ({
        id: c.id,
        label: c.label,
        required: c.required,
        sortOrder: c.sortOrder,
        completedAt: c.completedAt?.toISOString() ?? null,
        completedBy: c.completedBy,
      })),
      attachments: attachments.filter((a) => !a.submissionId).map(toAttachmentDto),
      submissions: submissions.map((s) => ({
        id: s.id,
        notes: s.notes,
        laborMinutes: s.laborMinutes,
        partsUsed: s.partsUsed,
        submittedBy: s.submittedBy,
        submittedAt: s.submittedAt.toISOString(),
        outcome: s.outcome,
        reviewedBy: s.reviewedBy,
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        reviewNote: s.reviewNote,
        attachments: s.attachments.map(toAttachmentDto),
      })),
      availableActions: getAvailableActions(
        { status: wo.status, requesterId: wo.requesterId, assigneeId: wo.assigneeId, resolvedAt: wo.resolvedAt },
        { userId: actor.userId, role: actor.role },
        policy,
        now,
      ),
      permissions: {
        canEdit: (isManager && wo.status !== 'CANCELLED' && wo.status !== 'CLOSED') || (isRequester && wo.status === 'OPEN'),
        canComment: wo.status !== 'CANCELLED',
        canInternalNote: isStaff,
        canUpload: active && (isManager || isAssignee || isRequester),
        canEditChecklist: (isManager || isAssignee) && ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(wo.status),
      },
    };
  }

  async get(actor: Actor, id: string): Promise<WorkOrderDetail> {
    return this.db.tx(actor.ctx, (tx) => this.detail(tx, actor, id));
  }

  async getByNumber(actor: Actor, number: number): Promise<WorkOrderDetail> {
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const wo = await tx.workOrder.findFirst({
        where: { organizationId: actor.organizationId, number, ...workOrderVisibility(actor, policy) },
        select: { id: true },
      });
      if (!wo) throw notFound('Work order');
      return this.detail(tx, actor, wo.id);
    });
  }
}

