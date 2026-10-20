import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@fixflow/db';
import {
  formatWorkOrderNumber,
  type ChecklistItemDto,
  type CreateCommentInput,
  type TimelineEntry,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { forbidden, notFound } from '../../common/errors.js';
import { AuditService } from '../../infra/audit.service.js';
import { OutboxService } from '../../infra/outbox.service.js';
import { RealtimePublisher } from '../../infra/realtime.publisher.js';
import { DATABASE } from '../../infra/tokens.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { loadPolicy } from './policy.js';
import { WorkOrderQueryService } from './work-order-query.service.js';

const CHECKLIST_EDITABLE = new Set(['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD']);

@Injectable()
export class ActivityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly query: WorkOrderQueryService,
    private readonly audit: AuditService,
    private readonly notifier: NotifierService,
    private readonly realtime: RealtimePublisher,
    private readonly outbox: OutboxService,
  ) {}

  async timeline(actor: Actor, id: string): Promise<TimelineEntry[]> {
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      await this.query.findVisible(tx, actor, policy, id);
      const org = actor.organizationId;
      const isStaff = actor.role !== 'REQUESTER';
      const user = { select: { id: true, name: true } } as const;
      const [status, assignments, comments, attachments, sla, submissions, updates] = await Promise.all([
        tx.workOrderStatusHistory.findMany({ where: { organizationId: org, workOrderId: id }, include: { actor: user } }),
        tx.workOrderAssignment.findMany({
          where: { organizationId: org, workOrderId: id },
          include: { assignedBy: user, assignee: { select: { user: user } } },
        }),
        tx.workOrderComment.findMany({
          where: { organizationId: org, workOrderId: id, ...(isStaff ? {} : { isInternal: false }) },
          include: { author: user },
        }),
        tx.attachment.findMany({ where: { organizationId: org, workOrderId: id }, include: { uploadedBy: user } }),
        isStaff ? tx.slaEvent.findMany({ where: { organizationId: org, workOrderId: id } }) : Promise.resolve([]),
        tx.resolutionSubmission.findMany({ where: { organizationId: org, workOrderId: id }, include: { submittedBy: user } }),
        isStaff
          ? tx.auditLog.findMany({
              where: { organizationId: org, entityType: 'WorkOrder', entityId: id, action: 'workOrder.updated' },
              include: { actor: user },
            })
          : Promise.resolve([]),
      ]);
      const entries: TimelineEntry[] = [
        ...status.map((s) => ({ kind: 'status' as const, id: s.id, at: s.createdAt.toISOString(), actor: s.actor, from: s.fromStatus, to: s.toStatus, reason: s.reason })),
        ...assignments.map((a) => ({ kind: 'assignment' as const, id: a.id, at: a.assignedAt.toISOString(), actor: a.assignedBy, assignee: a.assignee.user, method: a.method })),
        ...comments.map((c) => ({ kind: 'comment' as const, id: c.id, at: c.createdAt.toISOString(), actor: c.author, body: c.body, isInternal: c.isInternal })),
        ...attachments.map((a) => ({ kind: 'attachment' as const, id: a.id, at: a.createdAt.toISOString(), actor: a.uploadedBy, fileName: a.fileName, attachmentKind: a.kind })),
        ...sla.map((e) => ({ kind: 'sla' as const, id: e.id, at: e.occurredAt.toISOString(), type: e.type, dueAt: e.dueAt.toISOString() })),
        ...submissions.map((s) => ({ kind: 'submission' as const, id: s.id, at: s.submittedAt.toISOString(), actor: s.submittedBy, outcome: s.outcome })),
        ...updates.map((u) => ({
          kind: 'update' as const,
          id: u.id,
          at: u.createdAt.toISOString(),
          actor: u.actor,
          changes: ((u.metadata as { changes?: Record<string, { from: unknown; to: unknown }> }).changes ?? {}),
        })),
      ];
      return entries.sort((a, b) => a.at.localeCompare(b.at));
    });
  }

  async addComment(actor: Actor, id: string, input: CreateCommentInput): Promise<TimelineEntry> {
    if (input.isInternal && !actor.permissions.has('workOrder.internalNotes')) throw forbidden('Only staff can add internal notes');
    const { entry, notifications, wo } = await this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const wo = await this.query.findVisible(tx, actor, policy, id);
      if (wo.status === 'CANCELLED') throw forbidden('Cancelled work orders cannot receive comments');
      const c = await tx.workOrderComment.create({
        data: { organizationId: actor.organizationId, workOrderId: id, authorId: actor.userId, body: input.body, isInternal: input.isInternal },
        include: { author: { select: { id: true, name: true } } },
      });
      // Internal notes never notify the requester.
      const recipients = [wo.assigneeId, ...(input.isInternal ? [] : [wo.requesterId])];
      if (actor.role === 'REQUESTER' || actor.role === 'TECHNICIAN') recipients.push(...(await this.notifier.managers(tx, actor.organizationId)));
      const notifications = await this.notifier.notify(
        tx,
        actor.organizationId,
        recipients,
        {
          type: 'WORK_ORDER_COMMENT',
          title: `New ${input.isInternal ? 'internal note' : 'comment'} on ${formatWorkOrderNumber(wo.number)}`,
          body: `${c.author?.name ?? 'Someone'}: ${input.body.slice(0, 180)}`,
          workOrderId: id,
          dedupeKey: `comment:${c.id}`,
        },
        { excludeUserId: actor.userId },
      );
      return {
        wo,
        notifications,
        entry: { kind: 'comment' as const, id: c.id, at: c.createdAt.toISOString(), actor: c.author, body: c.body, isInternal: c.isInternal },
      };
    });
    this.realtime.commented(actor.organizationId, wo.id);
    for (const n of notifications) this.realtime.notify(n.userId, n.id, -1);
    this.outbox.nudge();
    return entry;
  }

  async setChecklistItem(actor: Actor, id: string, itemId: string, completed: boolean): Promise<ChecklistItemDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const wo = await this.query.findVisible(tx, actor, policy, id);
      const isManager = actor.role === 'MANAGER' || actor.role === 'ORG_ADMIN';
      if (!isManager && wo.assigneeId !== actor.userId) throw forbidden('Only the assigned technician can update the checklist');
      if (!CHECKLIST_EDITABLE.has(wo.status)) throw forbidden('The checklist can only be changed while work is assigned or in progress');
      const item = await tx.workOrderChecklistItem.findFirst({ where: { id: itemId, organizationId: actor.organizationId, workOrderId: id } });
      if (!item) throw notFound('Checklist item');
      // Setting a value (not toggling) makes retries from the offline outbox idempotent.
      const already = (item.completedAt !== null) === completed;
      const updated = already
        ? await tx.workOrderChecklistItem.findUniqueOrThrow({ where: { id: itemId }, include: { completedBy: { select: { id: true, name: true } } } })
        : await tx.workOrderChecklistItem.update({
            where: { id: itemId },
            data: completed ? { completedAt: new Date(), completedById: actor.userId } : { completedAt: null, completedById: null },
            include: { completedBy: { select: { id: true, name: true } } },
          });
      if (!already) {
        await this.audit.record(tx, actor, {
          action: completed ? 'workOrder.checklistCompleted' : 'workOrder.checklistReopened',
          entityType: 'WorkOrder',
          entityId: id,
          metadata: { itemId, label: item.label },
        });
      }
      return {
        id: updated.id,
        label: updated.label,
        required: updated.required,
        sortOrder: updated.sortOrder,
        completedAt: updated.completedAt?.toISOString() ?? null,
        completedBy: updated.completedBy,
      };
    });
  }

  async addChecklistItem(actor: Actor, id: string, input: { label: string; required: boolean }): Promise<ChecklistItemDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const wo = await this.query.findVisible(tx, actor, policy, id);
      const isManager = actor.role === 'MANAGER' || actor.role === 'ORG_ADMIN';
      if (!isManager && wo.assigneeId !== actor.userId) throw forbidden();
      if (!CHECKLIST_EDITABLE.has(wo.status) && wo.status !== 'OPEN') throw forbidden('The checklist is locked');
      const max = await tx.workOrderChecklistItem.aggregate({ where: { organizationId: actor.organizationId, workOrderId: id }, _max: { sortOrder: true } });
      const item = await tx.workOrderChecklistItem.create({
        data: { organizationId: actor.organizationId, workOrderId: id, label: input.label, required: input.required, sortOrder: (max._max.sortOrder ?? -1) + 1 },
      });
      await this.audit.record(tx, actor, { action: 'workOrder.checklistItemAdded', entityType: 'WorkOrder', entityId: id, metadata: { label: input.label } });
      return { id: item.id, label: item.label, required: item.required, sortOrder: item.sortOrder, completedAt: null, completedBy: null };
    });
  }
}
