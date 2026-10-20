import { Inject, Injectable, Logger } from '@nestjs/common';
import { isUniqueViolation, Prisma, type Database } from '@fixflow/db';
import { nextOccurrenceAfter, pickAutoAssignee, formatWorkOrderNumber } from '@fixflow/shared';
import { OutboxService } from '../infra/outbox.service.js';
import { RealtimePublisher } from '../infra/realtime.publisher.js';
import { DATABASE } from '../infra/tokens.js';
import { NotifierService } from '../modules/notifications/notifier.service.js';
import { AssignmentService } from '../modules/work-orders/assignment.service.js';
import { loadPolicy } from '../modules/work-orders/policy.js';
import { TransitionsService } from '../modules/work-orders/transitions.service.js';
import { WorkOrdersService } from '../modules/work-orders/work-orders.service.js';

const SYSTEM = 'SYSTEM' as const;

/**
 * Background automation. Every job runs inside a per-organization tenant transaction (RLS on)
 * as a SYSTEM actor, goes through the same state machine as users, and is idempotent:
 *  - auto-assign only acts while the work order is still OPEN at the version it read;
 *  - auto-close only closes RESOLVED work past the organization's window;
 *  - preventive maintenance relies on UNIQUE(schedule_id, scheduled_for).
 * Only the cross-tenant *discovery* queries use the system role.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly transitions: TransitionsService,
    private readonly assignment: AssignmentService,
    private readonly workOrders: WorkOrdersService,
    private readonly notifier: NotifierService,
    private readonly realtime: RealtimePublisher,
    private readonly outbox: OutboxService,
  ) {}

  async autoAssign(organizationId: string, workOrderId: string): Promise<'assigned' | 'no-candidate' | 'skipped'> {
    const result = await this.db.tx({ organizationId, userId: null }, async (tx) => {
      const policy = await loadPolicy(tx, organizationId);
      if (policy.autoAssignMode !== 'AUTO') return { status: 'skipped' as const };
      const wo = await tx.workOrder.findFirst({ where: { id: workOrderId, organizationId }, include: { category: { select: { name: true } } } });
      if (!wo || wo.status !== 'OPEN' || wo.assigneeId) return { status: 'skipped' as const };
      const ranked = await this.assignment.rank(tx, organizationId, wo.categoryId, wo.category.name);
      const pick = pickAutoAssignee(ranked);
      if (!pick) {
        await this.notifier.notify(tx, organizationId, await this.notifier.managers(tx, organizationId), {
          type: 'WORK_ORDER_CREATED',
          title: `${formatWorkOrderNumber(wo.number)} needs manual assignment`,
          body: `No available technician has the ${wo.category.name} skill.`,
          workOrderId: wo.id,
          dedupeKey: `auto-assign-failed:${wo.id}`,
        });
        return { status: 'no-candidate' as const };
      }
      const outcome = await this.transitions.apply(tx, { organizationId, userId: null, role: SYSTEM }, policy, wo.id, {
        action: 'assign',
        assigneeId: pick.userId,
        expectedVersion: wo.version,
      });
      return { status: 'assigned' as const, outcome };
    });
    if (result.status === 'assigned') {
      const w = result.outcome.workOrder;
      this.realtime.workOrderChanged({ organizationId, ...w });
      for (const n of result.outcome.notifications) this.realtime.notify(n.userId, n.id, -1);
      this.outbox.nudge();
    }
    return result.status;
  }

  /** Closes verified work after each organization's auto-close window. */
  async autoClose(limit = 200): Promise<number> {
    const due = await this.db.system.$queryRaw<{ id: string; organization_id: string; version: number }[]>(Prisma.sql`
      SELECT w.id, w.organization_id, w.version
      FROM work_orders w JOIN organizations o ON o.id = w.organization_id
      WHERE w.status = 'RESOLVED' AND w.resolved_at < now() - make_interval(days => o.auto_close_days)
      ORDER BY w.resolved_at LIMIT ${limit}`);
    let closed = 0;
    for (const r of due) {
      try {
        const outcome = await this.db.tx({ organizationId: r.organization_id, userId: null }, async (tx) => {
          const policy = await loadPolicy(tx, r.organization_id);
          return this.transitions.apply(tx, { organizationId: r.organization_id, userId: null, role: SYSTEM }, policy, r.id, { action: 'close', expectedVersion: r.version });
        });
        this.realtime.workOrderChanged({ organizationId: r.organization_id, ...outcome.workOrder });
        closed++;
      } catch (err) {
        // A concurrent user action (e.g. reopen) wins; the next run re-evaluates.
        this.logger.debug({ err, workOrderId: r.id }, 'auto-close skipped');
      }
    }
    return closed;
  }

  /** Generates preventive work orders for schedules whose next occurrence (minus lead time) is due. */
  async generateScheduled(limit = 100): Promise<number> {
    const due = await this.db.system.$queryRaw<{ id: string; organization_id: string }[]>(Prisma.sql`
      SELECT s.id, s.organization_id FROM maintenance_schedules s
      WHERE s.active AND s.next_due_at - make_interval(days => s.lead_time_days) <= now()
      ORDER BY s.next_due_at LIMIT ${limit}`);
    let created = 0;
    for (const row of due) {
      try {
        const res = await this.db.tx({ organizationId: row.organization_id, userId: null }, async (tx) => {
          const sc = await tx.maintenanceSchedule.findFirst({ where: { id: row.id, organizationId: row.organization_id, active: true } });
          if (!sc) return null;
          const policy = await loadPolicy(tx, row.organization_id);
          const occurrence = sc.nextDueAt;
          const next = nextOccurrenceAfter(sc.startsAt, sc.frequencyUnit, sc.frequencyInterval, occurrence, policy.timezone);
          let made: { id: string; number: number } | null = null;
          try {
            await tx.$executeRaw`SAVEPOINT gen`;
            made = await this.workOrders.createInTx(
              tx,
              { organizationId: row.organization_id, userId: null },
              {
                title: sc.title,
                description: sc.description ?? 'Preventive maintenance generated from the maintenance schedule.',
                priority: sc.priority,
                categoryId: sc.categoryId,
                assetId: sc.assetId,
                locationId: sc.locationId,
                checklistTemplateId: sc.checklistTemplateId,
              },
              { source: 'SCHEDULED', schedule: { id: sc.id, scheduledFor: occurrence } },
            );
          } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT gen`; // occurrence already generated — just advance
          }
          await tx.maintenanceSchedule.update({ where: { id: sc.id }, data: { nextDueAt: next, lastGeneratedAt: new Date() } });
          if (made && sc.defaultAssigneeId) {
            const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: made.id } });
            const m = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: row.organization_id, userId: sc.defaultAssigneeId } } });
            if (m?.status === 'ACTIVE' && m.role === 'TECHNICIAN') {
              await this.transitions.apply(tx, { organizationId: row.organization_id, userId: null, role: SYSTEM }, policy, made.id, {
                action: 'assign',
                assigneeId: sc.defaultAssigneeId,
                expectedVersion: wo.version,
              });
            }
          }
          return made;
        });
        if (res) {
          created++;
          this.realtime.workOrderChanged({ organizationId: row.organization_id, id: res.id, number: res.number, version: 1, status: 'OPEN', requesterId: null, assigneeId: null, created: true });
        }
      } catch (err) {
        this.logger.error({ err, scheduleId: row.id }, 'Scheduled maintenance generation failed');
      }
    }
    if (created) this.outbox.nudge();
    return created;
  }

  /** Retention: expired idempotency keys, old sessions/tokens, delivered outbox rows. */
  async housekeeping(): Promise<Record<string, number>> {
    const s = this.db.system;
    const day = 86_400_000;
    const [idem, sessions, tokens, outbox] = await Promise.all([
      s.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      s.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 30 * day) } } }),
      s.userToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * day) } } }),
      s.outboxEvent.deleteMany({ where: { status: 'DISPATCHED', dispatchedAt: { lt: new Date(Date.now() - 14 * day) } } }),
    ]);
    return { idempotency: idem.count, sessions: sessions.count, tokens: tokens.count, outbox: outbox.count };
  }
}
