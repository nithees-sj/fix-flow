import { Inject, Injectable } from '@nestjs/common';
import type { Database, Prisma, Tx } from '@fixflow/db';
import {
  computeSlaDeadlines,
  formatWorkOrderNumber,
  PRIORITY_META,
  type CreateWorkOrderInput,
  type Priority,
  type UpdateWorkOrderInput,
  type WorkOrderDetail,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { forbidden, notFound, versionConflict } from '../../common/errors.js';
import { AuditService } from '../../infra/audit.service.js';
import { OutboxService } from '../../infra/outbox.service.js';
import { RealtimePublisher } from '../../infra/realtime.publisher.js';
import { DATABASE } from '../../infra/tokens.js';
import { NotifierService, type CreatedNotification } from '../notifications/notifier.service.js';
import { diff } from '../organizations/organizations.service.js';
import { loadPolicy } from './policy.js';
import { WorkOrderQueryService } from './work-order-query.service.js';

/** Allocates the next per-organization number (row lock serializes concurrent creates). */
export async function nextWorkOrderNumber(tx: Tx, organizationId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ work_order_seq: number }[]>`
    UPDATE organizations SET work_order_seq = work_order_seq + 1
    WHERE id = ${organizationId}::uuid
    RETURNING work_order_seq`;
  const n = rows[0]?.work_order_seq;
  if (!n) throw notFound('Organization');
  return n;
}

export async function slaTargets(tx: Tx, organizationId: string, priority: Priority) {
  const p = await tx.slaPolicy.findUnique({ where: { organizationId_priority: { organizationId, priority } } });
  if (!p) throw new Error(`Missing SLA policy for ${priority}`);
  return p;
}

interface CreateContext {
  source?: 'WEB' | 'QR' | 'GUEST_QR' | 'SCHEDULED';
  guest?: { name: string; contact: string };
}

@Injectable()
export class WorkOrdersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly query: WorkOrderQueryService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly notifier: NotifierService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async create(actor: Actor, input: CreateWorkOrderInput): Promise<WorkOrderDetail> {
    const { detail, notifications } = await this.db.tx(actor.ctx, async (tx) => {
      const created = await this.createInTx(tx, actor, input, {});
      return { detail: await this.query.detail(tx, actor, created.id), notifications: created.notifications };
    });
    this.afterCommit(actor.organizationId, detail, notifications, true);
    return detail;
  }

  /**
   * Creates a work order inside an existing transaction. Shared by the authenticated create,
   * public guest QR reporting and preventive-maintenance generation.
   */
  async createInTx(
    tx: Tx,
    actor: { organizationId: string; userId: string | null; role?: string; ip?: string | null; userAgent?: string | null },
    input: CreateWorkOrderInput,
    ctx: CreateContext,
  ): Promise<{ id: string; number: number; notifications: CreatedNotification[] }> {
    const organizationId = actor.organizationId;
    const policy = await loadPolicy(tx, organizationId);

    const category = await tx.category.findFirst({ where: { id: input.categoryId, organizationId, archivedAt: null } });
    if (!category) throw notFound('Category');

    let locationId = input.locationId ?? null;
    let assetId = input.assetId ?? null;
    let source = ctx.source ?? 'WEB';
    let asset: { id: string; locationId: string; status: string; publicReportToken: string } | null = null;
    if (assetId) {
      asset = await tx.asset.findFirst({
        where: { id: assetId, organizationId, archivedAt: null },
        select: { id: true, locationId: true, status: true, publicReportToken: true },
      });
      if (!asset) throw notFound('Asset');
      locationId ??= asset.locationId;
    }
    if (locationId) {
      const loc = await tx.location.findFirst({ where: { id: locationId, organizationId, archivedAt: null }, select: { publicReportToken: true } });
      if (!loc) throw notFound('Location');
      if (input.qrToken && source === 'WEB' && (input.qrToken === loc.publicReportToken || input.qrToken === asset?.publicReportToken)) {
        source = 'QR';
      }
    }

    // Managers may attach a specific checklist; otherwise the category default applies.
    const isManager = actor.role === 'MANAGER' || actor.role === 'ORG_ADMIN';
    const templateId = (isManager || actor.role === undefined ? input.checklistTemplateId : null) ?? category.defaultChecklistTemplateId;
    const templateItems = templateId
      ? await tx.checklistTemplateItem.findMany({ where: { organizationId, templateId }, orderBy: { sortOrder: 'asc' } })
      : [];
    if (input.checklistTemplateId && isManager && !templateItems.length) {
      const exists = await tx.checklistTemplate.count({ where: { id: input.checklistTemplateId, organizationId } });
      if (!exists) throw notFound('Checklist template');
    }

    const number = await nextWorkOrderNumber(tx, organizationId);
    const targets = await slaTargets(tx, organizationId, input.priority);
    const now = new Date();
    const deadlines = computeSlaDeadlines(now, targets);

    const wo = await tx.workOrder.create({
      data: {
        organizationId,
        number,
        title: input.title,
        description: input.description,
        priority: input.priority,
        source,
        categoryId: category.id,
        locationId,
        assetId,
        requesterId: ctx.source === 'GUEST_QR' || ctx.source === 'SCHEDULED' ? null : actor.userId,
        guestName: ctx.guest?.name ?? null,
        guestContact: ctx.guest?.contact ?? null,
        cycleStartedAt: now,
        responseDueAt: deadlines.responseDueAt,
        resolutionDueAt: deadlines.resolutionDueAt,
        slaWarningPercent: targets.warningPercent,
      },
      select: { id: true, number: true },
    });

    if (templateItems.length) {
      await tx.workOrderChecklistItem.createMany({
        data: templateItems.map((t) => ({ organizationId, workOrderId: wo.id, label: t.label, required: t.required, sortOrder: t.sortOrder })),
      });
    }
    await tx.workOrderStatusHistory.create({
      data: { organizationId, workOrderId: wo.id, fromStatus: null, toStatus: 'OPEN', actorId: actor.userId },
      select: { id: true },
    });
    await this.audit.record(tx, actor, {
      action: 'workOrder.created',
      entityType: 'WorkOrder',
      entityId: wo.id,
      metadata: { number, title: input.title, priority: input.priority, source },
    });

    // Narrow, automatic asset status: an operational asset with a new report needs attention.
    if (asset?.status === 'OPERATIONAL') {
      await tx.asset.updateMany({ where: { id: asset.id, organizationId, status: 'OPERATIONAL' }, data: { status: 'NEEDS_ATTENTION' } });
    }

    const notifications = await this.notifier.notify(
      tx,
      organizationId,
      await this.notifier.managers(tx, organizationId),
      {
        type: 'WORK_ORDER_CREATED',
        title: `${formatWorkOrderNumber(number)} · ${input.title}`,
        body: `New ${PRIORITY_META[input.priority].label.toLowerCase()} priority request in ${category.name}.`,
        workOrderId: wo.id,
        dedupeKey: `created:${wo.id}`,
      },
      { excludeUserId: actor.userId },
    );

    await this.outbox.add(tx, organizationId, 'sla.schedule', { workOrderId: wo.id }, wo.id);
    if (policy.autoAssignMode === 'AUTO') {
      await this.outbox.add(tx, organizationId, 'workOrder.autoAssign', { workOrderId: wo.id }, wo.id);
    }
    return { id: wo.id, number: wo.number, notifications };
  }

  async update(actor: Actor, id: string, input: UpdateWorkOrderInput): Promise<WorkOrderDetail> {
    const { detail, notifications } = await this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const wo = await this.query.findVisible(tx, actor, policy, id);
      const isManager = actor.permissions.has('workOrder.update');
      const isOwnOpenRequest = wo.requesterId === actor.userId && wo.status === 'OPEN';
      if (!isManager && !isOwnOpenRequest) throw forbidden('You cannot edit this work order');
      if (!isManager && (input.priority || input.categoryId || input.locationId !== undefined || input.assetId !== undefined)) {
        throw forbidden('Only managers can change priority, category or location');
      }
      if (wo.status === 'CANCELLED' || wo.status === 'CLOSED') throw forbidden('Closed work orders cannot be edited');
      if (wo.version !== input.expectedVersion) throw versionConflict(wo.version);

      const data: Prisma.WorkOrderUncheckedUpdateManyInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.categoryId && input.categoryId !== wo.categoryId) {
        const c = await tx.category.findFirst({ where: { id: input.categoryId, organizationId: actor.organizationId, archivedAt: null } });
        if (!c) throw notFound('Category');
        data.categoryId = c.id;
      }
      if (input.assetId !== undefined && input.assetId !== wo.assetId) {
        if (input.assetId) {
          const a = await tx.asset.findFirst({ where: { id: input.assetId, organizationId: actor.organizationId, archivedAt: null } });
          if (!a) throw notFound('Asset');
          data.assetId = a.id;
          if (input.locationId === undefined) data.locationId = a.locationId;
        } else data.assetId = null;
      }
      if (input.locationId !== undefined && input.locationId !== wo.locationId) {
        if (input.locationId) {
          const l = await tx.location.findFirst({ where: { id: input.locationId, organizationId: actor.organizationId, archivedAt: null } });
          if (!l) throw notFound('Location');
        }
        data.locationId = input.locationId;
      }
      let reschedule = false;
      if (input.priority && input.priority !== wo.priority) {
        const targets = await slaTargets(tx, actor.organizationId, input.priority);
        const d = computeSlaDeadlines(wo.cycleStartedAt, targets);
        Object.assign(data, { priority: input.priority, responseDueAt: d.responseDueAt, resolutionDueAt: d.resolutionDueAt, slaWarningPercent: targets.warningPercent });
        reschedule = true;
      }

      const res = await tx.workOrder.updateMany({
        where: { id, organizationId: actor.organizationId, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (res.count === 0) throw versionConflict(wo.version);

      const after = await tx.workOrder.findUniqueOrThrow({ where: { id } });
      const changes = diff(wo, after, Object.keys(data));
      await this.audit.record(tx, actor, { action: 'workOrder.updated', entityType: 'WorkOrder', entityId: id, metadata: { changes } });
      if (reschedule) await this.outbox.add(tx, actor.organizationId, 'sla.schedule', { workOrderId: id }, id);

      let notifications: CreatedNotification[] = [];
      if (changes.priority) {
        notifications = await this.notifier.notify(
          tx,
          actor.organizationId,
          [wo.assigneeId, wo.requesterId],
          {
            type: 'WORK_ORDER_STATUS_CHANGED',
            title: `${formatWorkOrderNumber(wo.number)} priority changed`,
            body: `Priority changed from ${PRIORITY_META[wo.priority].label} to ${PRIORITY_META[after.priority].label}.`,
            workOrderId: id,
            dedupeKey: `priority:${id}:${after.version}`,
          },
          { excludeUserId: actor.userId },
        );
      }
      return { detail: await this.query.detail(tx, actor, id), notifications };
    });
    this.afterCommit(actor.organizationId, detail, notifications);
    return detail;
  }

  /** Realtime hints + outbox nudge, strictly after the transaction committed. */
  afterCommit(
    organizationId: string,
    wo: { id: string; number: number; version: number; status: WorkOrderDetail['status']; requester: { id: string } | null; assignee: { id: string } | null },
    notifications: CreatedNotification[],
    created = false,
  ): void {
    this.realtime.workOrderChanged({
      organizationId,
      id: wo.id,
      number: wo.number,
      version: wo.version,
      status: wo.status,
      requesterId: wo.requester?.id ?? null,
      assigneeId: wo.assignee?.id ?? null,
      created,
    });
    for (const n of notifications) this.realtime.notify(n.userId, n.id, -1);
    this.outbox.nudge();
  }
}
