import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma, type Database } from '@fixflow/db';
import { ACTIVE_STATUSES, formatWorkOrderNumber, slaJobId, warningAt } from '@fixflow/shared';
import { AuditService } from '../infra/audit.service.js';
import { RealtimePublisher } from '../infra/realtime.publisher.js';
import { DATABASE } from '../infra/tokens.js';
import { NotifierService, type CreatedNotification } from '../modules/notifications/notifier.service.js';
import type { SlaJobData } from './queues.js';

const ACTIVE = new Set<string>(ACTIVE_STATUSES);
type CheckType = SlaJobData['type'];

/**
 * SLA engine.
 *  schedule(): one delayed BullMQ job per (type, cycle, due time) with a deterministic jobId —
 *              rescheduling the same deadline twice collapses into one job.
 *  check():    re-reads the work order and is a no-op when the job is stale (cycle changed,
 *              deadline moved, clock already stopped). The SlaEvent unique key
 *              (work_order_id, type, cycle) guarantees side effects happen exactly once,
 *              no matter how many times a job is delivered.
 *  sweep():    finds deadlines that passed without an event (Redis loss, downtime) and
 *              processes them — scheduled work is always recoverable from Postgres.
 */
@Injectable()
export class SlaEngine {
  private readonly logger = new Logger(SlaEngine.name);
  private queue: Queue<SlaJobData> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly notifier: NotifierService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimePublisher,
  ) {}

  attach(queue: Queue<SlaJobData>): void {
    this.queue = queue;
  }

  async schedule(organizationId: string, workOrderId: string): Promise<number> {
    const wo = await this.db.tx({ organizationId, userId: null }, (tx) =>
      tx.workOrder.findFirst({
        where: { id: workOrderId, organizationId },
        select: { id: true, status: true, slaCycle: true, cycleStartedAt: true, responseDueAt: true, resolutionDueAt: true, slaWarningPercent: true, respondedAt: true, resolutionSubmittedAt: true },
      }),
    );
    if (!wo || !ACTIVE.has(wo.status)) return 0;
    const plan: { type: CheckType; fireAt: Date; dueAt: Date }[] = [];
    if (!wo.respondedAt) {
      plan.push({ type: 'RESPONSE_WARNING', fireAt: warningAt(wo.cycleStartedAt, wo.responseDueAt, wo.slaWarningPercent), dueAt: wo.responseDueAt });
      plan.push({ type: 'RESPONSE_BREACH', fireAt: wo.responseDueAt, dueAt: wo.responseDueAt });
    }
    if (!wo.resolutionSubmittedAt) {
      plan.push({ type: 'RESOLUTION_WARNING', fireAt: warningAt(wo.cycleStartedAt, wo.resolutionDueAt, wo.slaWarningPercent), dueAt: wo.resolutionDueAt });
      plan.push({ type: 'RESOLUTION_BREACH', fireAt: wo.resolutionDueAt, dueAt: wo.resolutionDueAt });
    }
    let scheduled = 0;
    for (const p of plan) {
      const data: SlaJobData = { organizationId, workOrderId, type: p.type, cycle: wo.slaCycle, dueAt: p.dueAt.toISOString() };
      const delay = p.fireAt.getTime() - Date.now();
      if (delay <= 0) {
        await this.check(data); // already due → handle now (idempotent)
      } else if (this.queue) {
        await this.queue.add('check', data, { jobId: slaJobId(workOrderId, p.type, wo.slaCycle, p.fireAt), delay });
        scheduled++;
      }
    }
    return scheduled;
  }

  /** Returns true when the event was recorded by this call (false = stale or duplicate). */
  async check(job: SlaJobData): Promise<boolean> {
    const isResponse = job.type.startsWith('RESPONSE');
    const isBreach = job.type.endsWith('BREACH');
    type Recorded = { notifications: CreatedNotification[]; wo: { id: string; number: number; version: number; status: (typeof ACTIVE_STATUSES)[number]; requesterId: string | null; assigneeId: string | null } };

    const recorded = await this.db.tx<Recorded | null>({ organizationId: job.organizationId, userId: null }, async (tx) => {
      const w = await tx.workOrder.findFirst({ where: { id: job.workOrderId, organizationId: job.organizationId } });
      if (!w || w.slaCycle !== job.cycle || !ACTIVE.has(w.status)) return null;
      const due = isResponse ? w.responseDueAt : w.resolutionDueAt;
      if (due.toISOString() !== job.dueAt) return null; // deadline moved (priority change)
      if (isResponse ? w.respondedAt : w.resolutionSubmittedAt) return null; // clock stopped
      const fireAt = isBreach ? due : warningAt(w.cycleStartedAt, due, w.slaWarningPercent);
      if (Date.now() + 1_000 < fireAt.getTime()) return null; // early delivery

      const inserted = await tx.slaEvent.createMany({
        data: [{ organizationId: job.organizationId, workOrderId: w.id, type: job.type, cycle: job.cycle, dueAt: due, occurredAt: new Date() }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return null; // already processed (duplicate delivery)

      const policy = await tx.slaPolicy.findUnique({ where: { organizationId_priority: { organizationId: job.organizationId, priority: w.priority } } });
      const managers = await this.notifier.managers(tx, job.organizationId);
      const notifications = await this.notifier.notify(tx, job.organizationId, isBreach ? [...managers, w.assigneeId] : [w.assigneeId, ...managers], {
        type: isBreach ? 'SLA_BREACH' : 'SLA_WARNING',
        title: isBreach ? `${formatWorkOrderNumber(w.number)} missed its ${isResponse ? 'response' : 'resolution'} target` : `${formatWorkOrderNumber(w.number)} is close to its ${isResponse ? 'response' : 'resolution'} deadline`,
        body: w.title, // the number is already in the title
        workOrderId: w.id,
        dedupeKey: `sla:${job.type}:${w.id}:${job.cycle}`,
      });
      if (isBreach && policy?.escalationEnabled !== false) {
        // Escalation is operational metadata, not a user edit: it does not bump `version`.
        await tx.workOrder.updateMany({ where: { id: w.id, organizationId: job.organizationId }, data: { escalationLevel: { increment: 1 } } });
      }
      await this.audit.record(tx, { organizationId: job.organizationId, userId: null }, {
        action: isBreach ? 'sla.breached' : 'sla.warning',
        entityType: 'WorkOrder',
        entityId: w.id,
        metadata: { type: job.type, cycle: job.cycle, dueAt: job.dueAt },
      });
      return {
        notifications,
        wo: { id: w.id, number: w.number, version: w.version, status: w.status as (typeof ACTIVE_STATUSES)[number], requesterId: w.requesterId, assigneeId: w.assigneeId },
      };
    });

    if (!recorded) return false;
    this.realtime.workOrderChanged({ organizationId: job.organizationId, ...recorded.wo });
    for (const n of recorded.notifications) this.realtime.notify(n.userId, n.id, -1);
    this.logger.log({ workOrderId: job.workOrderId, type: job.type }, 'SLA event recorded');
    return true;
  }

  /** Recovery: process passed deadlines that have no event yet (cross-tenant scan via system role). */
  async sweep(limit = 500): Promise<number> {
    const rows = await this.db.system.$queryRaw<{ organization_id: string; id: string; type: CheckType; cycle: number; due: Date }[]>(Prisma.sql`
      SELECT w.organization_id, w.id, t.type::text AS type, w.sla_cycle AS cycle, t.due
      FROM work_orders w
      CROSS JOIN LATERAL (VALUES
        ('RESPONSE_BREACH', w.response_due_at, w.responded_at),
        ('RESOLUTION_BREACH', w.resolution_due_at, w.resolution_submitted_at)
      ) AS t(type, due, stopped)
      WHERE w.status IN ('OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','PENDING_VERIFICATION')
        AND t.stopped IS NULL AND t.due < now()
        AND NOT EXISTS (
          SELECT 1 FROM sla_events e
          WHERE e.work_order_id = w.id AND e.cycle = w.sla_cycle AND e.type::text = t.type)
      ORDER BY t.due
      LIMIT ${limit}`);
    let n = 0;
    for (const r of rows) {
      if (await this.check({ organizationId: r.organization_id, workOrderId: r.id, type: r.type, cycle: r.cycle, dueAt: r.due.toISOString() })) n++;
    }
    if (n) this.logger.warn({ recovered: n }, 'SLA sweep recorded missed deadlines');
    return n;
  }
}
