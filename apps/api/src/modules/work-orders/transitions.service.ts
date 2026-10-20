import { Inject, Injectable } from '@nestjs/common';
import type { Database, Prisma, Tx } from '@fixflow/db';
import {
  ACTIVE_STATUSES,
  computeSlaDeadlines,
  evaluateTransition,
  formatWorkOrderNumber,
  STATUS_META,
  SUBMISSION_ISSUE_MESSAGES,
  validateResolutionSubmission,
  type ActorRole,
  type TransitionInput,
  type WorkOrderDetail,
  type WorkOrderStatus,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { notFound, unprocessable, versionConflict } from '../../common/errors.js';
import { AuditService } from '../../infra/audit.service.js';
import { OutboxService } from '../../infra/outbox.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { NotifierService, type CreatedNotification } from '../notifications/notifier.service.js';
import { workOrderVisibility } from './access.js';
import { loadPolicy, type OrgPolicy } from './policy.js';
import { WorkOrderQueryService } from './work-order-query.service.js';
import { slaTargets, WorkOrdersService } from './work-orders.service.js';

/** Who is acting: a verified member (HTTP) or system automation inside a tenant (worker). */
export interface TransitionActor {
  organizationId: string;
  userId: string | null;
  role: ActorRole;
  ip?: string | null;
  userAgent?: string | null;
}

interface Outcome {
  notifications: CreatedNotification[];
  workOrder: { id: string; number: number; version: number; status: WorkOrderStatus; requesterId: string | null; assigneeId: string | null };
}

/**
 * The single path for every work-order status change.
 *
 * Inside ONE transaction (under RLS): load + authorize via the shared state machine, apply
 * action-specific effects, perform a version-checked update (optimistic concurrency), write
 * status history + audit log + notifications + outbox events. Realtime hints are emitted only
 * after commit. Concurrent conflicting changes lose with 409 VERSION_CONFLICT.
 */
@Injectable()
export class TransitionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly query: WorkOrderQueryService,
    private readonly workOrders: WorkOrdersService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly notifier: NotifierService,
  ) {}

  /** HTTP entry point. */
  async transition(actor: Actor, id: string, input: TransitionInput): Promise<WorkOrderDetail> {
    const { outcome, detail } = await this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      // Visibility first: anything the actor cannot see is a 404, whatever the action.
      const visible = await tx.workOrder.count({ where: { id, organizationId: actor.organizationId, ...workOrderVisibility(actor, policy) } });
      if (!visible) throw notFound('Work order');
      const outcome = await this.apply(tx, actor, policy, id, input);
      return { outcome, detail: await this.query.detail(tx, actor, id) };
    });
    this.workOrders.afterCommit(actor.organizationId, detail, outcome.notifications);
    return detail;
  }

  /** Shared by HTTP and worker automation (auto-assign, auto-close). */
  async apply(tx: Tx, actor: TransitionActor, policy: OrgPolicy, id: string, input: TransitionInput): Promise<Outcome> {
    const orgId = actor.organizationId;
    const wo = await tx.workOrder.findFirst({ where: { id, organizationId: orgId } });
    if (!wo) throw notFound('Work order');
    if (wo.version !== input.expectedVersion) throw versionConflict(wo.version);

    const now = new Date();
    const target = input.action === 'assign' || input.action === 'reassign' ? input.assigneeId : null;
    let previousAssigneeActive = false;
    if (input.action === 'reopen' && wo.assigneeId) {
      const m = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: wo.assigneeId } } });
      previousAssigneeActive = m?.status === 'ACTIVE' && m.role === 'TECHNICIAN';
    }

    const decision = evaluateTransition(
      input.action,
      { status: wo.status, requesterId: wo.requesterId, assigneeId: wo.assigneeId, resolvedAt: wo.resolvedAt },
      { userId: actor.userId, role: actor.role },
      policy,
      { now, targetAssigneeId: target, previousAssigneeActive },
    );
    if (!decision.allowed) throw unprocessable('WORKFLOW_DENIED', decision.message, [decision.code]);

    const to = decision.to;
    const data: Prisma.WorkOrderUncheckedUpdateManyInput = { status: to };
    const reason = 'reason' in input ? input.reason : null;
    const label = formatWorkOrderNumber(wo.number);
    const notifications: CreatedNotification[] = [];
    const notify = async (recipients: (string | null)[], spec: Parameters<NotifierService['notify']>[3]) =>
      notifications.push(...(await this.notifier.notify(tx, orgId, recipients, spec, { excludeUserId: actor.userId })));
    const statusUpdate = (body: string) => ({
      type: 'WORK_ORDER_STATUS_CHANGED' as const,
      title: `${label} · ${STATUS_META[to].label}`,
      body,
      workOrderId: id,
      dedupeKey: `status:${id}:${wo.version + 1}`,
    });
    let auditMeta: Record<string, unknown> = {};
    let reschedule = false;

    switch (input.action) {
      case 'assign':
      case 'reassign': {
        const tech = await tx.membership.findUnique({
          where: { organizationId_userId: { organizationId: orgId, userId: input.assigneeId } },
          include: { user: { select: { name: true } } },
        });
        if (!tech || tech.status !== 'ACTIVE' || tech.role !== 'TECHNICIAN') throw notFound('Technician');
        await tx.workOrderAssignment.updateMany({ where: { organizationId: orgId, workOrderId: id, unassignedAt: null }, data: { unassignedAt: now } });
        await tx.workOrderAssignment.create({
          data: {
            organizationId: orgId,
            workOrderId: id,
            assigneeId: input.assigneeId,
            assignedById: actor.userId,
            method: actor.role === 'SYSTEM' ? 'AUTO' : actor.userId === input.assigneeId ? 'SELF' : 'MANUAL',
          },
          select: { id: true },
        });
        data.assigneeId = input.assigneeId;
        auditMeta = { assigneeId: input.assigneeId, previousAssigneeId: wo.assigneeId };
        await notify([input.assigneeId], {
          type: 'WORK_ORDER_ASSIGNED',
          title: `${label} assigned to you`,
          body: `${wo.title} — ${wo.priority.toLowerCase()} priority.`,
          workOrderId: id,
          dedupeKey: `assigned:${id}:${wo.version + 1}`,
        });
        if (wo.assigneeId && wo.assigneeId !== input.assigneeId) {
          await notify([wo.assigneeId], statusUpdate(`${wo.title} was reassigned to ${tech.user.name}.`));
        }
        await notify([wo.requesterId], statusUpdate(`${tech.user.name} has been assigned to your request.`));
        break;
      }
      case 'unassign':
        await tx.workOrderAssignment.updateMany({
          where: { organizationId: orgId, workOrderId: id, unassignedAt: null },
          data: { unassignedAt: now, reason },
        });
        data.assigneeId = null;
        await notify(await this.notifier.managers(tx, orgId), statusUpdate(`${wo.title} needs a new technician: ${reason}`));
        break;
      case 'start':
        if (!wo.respondedAt) data.respondedAt = now;
        await notify([wo.requesterId], statusUpdate('A technician has started working on your request.'));
        break;
      case 'hold':
        await notify([wo.requesterId, ...(await this.notifier.managers(tx, orgId))], statusUpdate(`On hold: ${reason}`));
        break;
      case 'resume':
        await notify([wo.requesterId], statusUpdate('Work has resumed on your request.'));
        break;
      case 'submit_resolution': {
        const openRequired = await tx.workOrderChecklistItem.count({
          where: { organizationId: orgId, workOrderId: id, required: true, completedAt: null },
        });
        const attachmentIds = [...new Set(input.attachmentIds)];
        const evidence = attachmentIds.length
          ? await tx.attachment.findMany({
              where: { organizationId: orgId, workOrderId: id, id: { in: attachmentIds }, submissionId: null },
              select: { id: true, contentType: true },
            })
          : [];
        if (evidence.length !== attachmentIds.length) throw notFound('Attachment');
        const photos = evidence.filter((a) => a.contentType.startsWith('image/')).length;
        const issues = validateResolutionSubmission({
          notes: input.notes,
          openRequiredChecklistItems: openRequired,
          evidenceCount: photos,
          requireEvidencePhoto: policy.requireEvidencePhoto,
        });
        if (issues.length) {
          throw unprocessable('SUBMISSION_INCOMPLETE', issues.map((i) => SUBMISSION_ISSUE_MESSAGES[i]).join(' '), issues);
        }
        const submission = await tx.resolutionSubmission.create({
          data: {
            organizationId: orgId,
            workOrderId: id,
            submittedById: actor.userId!,
            notes: input.notes,
            laborMinutes: input.laborMinutes ?? null,
            partsUsed: input.partsUsed ?? null,
            submittedAt: now,
          },
          select: { id: true },
        });
        if (evidence.length) {
          await tx.attachment.updateMany({
            where: { organizationId: orgId, id: { in: evidence.map((e) => e.id) } },
            data: { submissionId: submission.id, kind: 'EVIDENCE' },
          });
        }
        // Provisional clock stop; cleared again if the resolution is rejected.
        data.resolutionSubmittedAt = now;
        auditMeta = { submissionId: submission.id, evidenceCount: evidence.length };
        const reviewers = [...(policy.requesterCanVerify ? [wo.requesterId] : []), ...(await this.notifier.managers(tx, orgId))];
        await notify(reviewers, {
          type: 'RESOLUTION_SUBMITTED',
          title: `${label} ready for verification`,
          body: `${wo.title} — the technician submitted the completed repair for review.`,
          workOrderId: id,
          dedupeKey: `submitted:${submission.id}`,
        });
        break;
      }
      case 'approve':
      case 'reject': {
        const submission = await tx.resolutionSubmission.findFirst({
          where: { organizationId: orgId, workOrderId: id, outcome: 'PENDING' },
          orderBy: { submittedAt: 'desc' },
        });
        if (!submission) throw unprocessable('WORKFLOW_DENIED', 'There is no pending resolution to review.');
        const approved = input.action === 'approve';
        await tx.resolutionSubmission.update({
          where: { id: submission.id },
          data: {
            outcome: approved ? 'APPROVED' : 'REJECTED',
            reviewedById: actor.userId,
            reviewedAt: now,
            reviewNote: approved ? (input.note ?? null) : input.reason,
          },
          select: { id: true },
        });
        auditMeta = { submissionId: submission.id, outcome: approved ? 'APPROVED' : 'REJECTED' };
        if (approved) {
          Object.assign(data, { resolutionSubmittedAt: submission.submittedAt, resolvedAt: now, verifiedAt: now });
          await this.restoreAssetIfClear(tx, orgId, wo.assetId, id);
          await notify([wo.assigneeId], {
            type: 'RESOLUTION_APPROVED',
            title: `${label} approved`,
            body: `Your repair for “${wo.title}” was verified.`,
            workOrderId: id,
            dedupeKey: `approved:${submission.id}`,
          });
          await notify([wo.requesterId], statusUpdate('The repair was verified and the request is resolved.'));
        } else {
          Object.assign(data, { resolutionSubmittedAt: null, reworkCount: { increment: 1 } });
          await notify([wo.assigneeId], {
            type: 'RESOLUTION_REJECTED',
            title: `${label} needs rework`,
            body: `Reason: ${input.reason}`,
            workOrderId: id,
            dedupeKey: `rejected:${submission.id}`,
          });
        }
        break;
      }
      case 'close':
        data.closedAt = now;
        break;
      case 'reopen': {
        const targets = await slaTargets(tx, orgId, wo.priority);
        const d = computeSlaDeadlines(now, targets);
        Object.assign(data, {
          slaCycle: { increment: 1 },
          reopenCount: { increment: 1 },
          cycleStartedAt: now,
          responseDueAt: d.responseDueAt,
          resolutionDueAt: d.resolutionDueAt,
          slaWarningPercent: targets.warningPercent,
          respondedAt: null,
          resolutionSubmittedAt: null,
          resolvedAt: null,
          verifiedAt: null,
          closedAt: null,
          escalationLevel: 0,
        });
        if (to === 'OPEN') {
          data.assigneeId = null;
          await tx.workOrderAssignment.updateMany({ where: { organizationId: orgId, workOrderId: id, unassignedAt: null }, data: { unassignedAt: now, reason: 'Reopened' } });
        }
        reschedule = true;
        await notify([...(to === 'ASSIGNED' ? [wo.assigneeId] : []), ...(await this.notifier.managers(tx, orgId))], statusUpdate(`Reopened: ${reason}`));
        break;
      }
      case 'cancel':
        data.cancelledAt = now;
        await tx.workOrderAssignment.updateMany({ where: { organizationId: orgId, workOrderId: id, unassignedAt: null }, data: { unassignedAt: now, reason: 'Cancelled' } });
        await this.restoreAssetIfClear(tx, orgId, wo.assetId, id);
        await notify([wo.requesterId, wo.assigneeId], statusUpdate(`Cancelled: ${reason}`));
        break;
    }

    const res = await tx.workOrder.updateMany({
      where: { id, organizationId: orgId, version: input.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count === 0) throw versionConflict(wo.version);

    await tx.workOrderStatusHistory.create({
      data: { organizationId: orgId, workOrderId: id, fromStatus: wo.status, toStatus: to, actorId: actor.userId, reason: reason ?? null },
      select: { id: true },
    });
    await this.audit.record(tx, actor, {
      action: `workOrder.${input.action}`,
      entityType: 'WorkOrder',
      entityId: id,
      metadata: { number: wo.number, from: wo.status, to, reason, ...auditMeta },
    });
    if (reschedule) await this.outbox.add(tx, orgId, 'sla.schedule', { workOrderId: id }, id);

    const after = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      select: { id: true, number: true, version: true, status: true, requesterId: true, assigneeId: true },
    });
    return { notifications, workOrder: after };
  }

  /** Put an asset back to OPERATIONAL when its last active work order is finished. */
  private async restoreAssetIfClear(tx: Tx, orgId: string, assetId: string | null, exceptWorkOrderId: string): Promise<void> {
    if (!assetId) return;
    const stillOpen = await tx.workOrder.count({
      where: { organizationId: orgId, assetId, id: { not: exceptWorkOrderId }, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (stillOpen === 0) {
      await tx.asset.updateMany({
        where: { id: assetId, organizationId: orgId, status: { in: ['NEEDS_ATTENTION', 'UNDER_MAINTENANCE'] } },
        data: { status: 'OPERATIONAL' },
      });
    }
  }
}
