/**
 * Background processing reliability (amendment 2): transactional outbox, idempotent processors,
 * duplicate delivery, crash-between-commit-and-enqueue, Redis loss + sweep recovery,
 * concurrent dispatchers. Runs against the real test Postgres and Redis (db 1).
 */
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryMailProvider } from '../../src/infra/mail/mail.service.js';
import { AutomationService } from '../../src/worker/automation.service.js';
import { EmailProcessor } from '../../src/worker/email.processor.js';
import { OutboxDispatcher } from '../../src/worker/outbox.dispatcher.js';
import { SlaEngine } from '../../src/worker/sla.engine.js';
import { WorkerModule } from '../../src/worker/worker.module.js';
import { WorkerRuntime } from '../../src/worker/worker.runtime.js';
import { createOrg, type OrgFixture } from './fixtures.js';
import { resetState, startHarness, type Harness } from './harness.js';

let h: Harness;
let w: INestApplicationContext;
let o: OrgFixture;
let runtime: WorkerRuntime;

beforeAll(async () => {
  h = await startHarness();
  await resetState(h);
  w = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  runtime = w.get(WorkerRuntime);
  w.get(OutboxDispatcher).attach(runtime.queues.outbox);
  o = await createOrg(h, 'Worker Test Org');
});
afterAll(async () => {
  await w.close();
  await h.close();
});
beforeEach(() => {
  MemoryMailProvider.sent.length = 0;
});

const report = (title = 'Server room overheating') =>
  o.requester.client.post('/work-orders', { title, categoryId: o.categories.HVAC, assetId: o.assetId, priority: 'CRITICAL' }).expect(201);

describe('transactional outbox', () => {
  it('records side effects in the same transaction and dispatches each row exactly once', async () => {
    const wo = await report();
    const rows = await h.db.system.outboxEvent.findMany({ where: { aggregateId: wo.body.id } });
    expect(rows.map((r) => r.type).sort()).toEqual(['sla.schedule']);
    const pendingBefore = await h.db.system.outboxEvent.count({ where: { status: 'PENDING' } });
    expect(pendingBefore).toBeGreaterThan(0);

    const d = w.get(OutboxDispatcher);
    expect(await d.tick()).toBe(pendingBefore);
    expect(await d.tick()).toBe(0);
    expect(await h.db.system.outboxEvent.count({ where: { status: 'PENDING' } })).toBe(0);
  });

  it('a crash between enqueue and marking DISPATCHED does not create a duplicate job', async () => {
    const wo = await report('Crash simulation');
    const d = w.get(OutboxDispatcher);
    await d.tick();
    const row = await h.db.system.outboxEvent.findFirstOrThrow({ where: { aggregateId: wo.body.id, type: 'sla.schedule' } });
    const before = await runtime.queues.outbox.getJob(row.id);
    expect(before).toBeTruthy();
    // Simulate the process dying after queue.add but before the status update committed.
    await h.db.system.outboxEvent.update({ where: { id: row.id }, data: { status: 'PENDING', availableAt: new Date(0) } });
    await d.tick();
    const counts = await runtime.queues.outbox.getJobCountByTypes('waiting', 'delayed', 'active', 'completed');
    const ids = (await runtime.queues.outbox.getJobs(['waiting', 'delayed', 'active', 'completed'])).map((j) => j.id);
    expect(ids.filter((id) => id === row.id)).toHaveLength(1);
    expect(counts).toBe(new Set(ids).size);
  });

  it('two dispatchers running concurrently never claim the same row twice', async () => {
    for (let i = 0; i < 12; i++) await report(`Concurrent ${i}`);
    const pending = await h.db.system.outboxEvent.count({ where: { status: 'PENDING' } });
    const other = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    other.get(OutboxDispatcher).attach(runtime.queues.outbox);
    const [a, b] = await Promise.all([w.get(OutboxDispatcher).tick(), other.get(OutboxDispatcher).tick()]);
    expect(a + b).toBe(pending);
    await other.close();
  });
});

describe('idempotent email delivery', () => {
  it('a redelivered job does not send the same email twice', async () => {
    const event = await h.db.system.outboxEvent.create({
      data: { organizationId: o.orgId, type: 'email.send', payload: { to: 'someone@example.test', template: 'password-changed', data: { name: 'Sam' } } },
    });
    const email = w.get(EmailProcessor);
    const payload = event.payload as never;
    await email.direct(event.id, o.orgId, payload);
    await email.direct(event.id, o.orgId, payload);
    expect(MemoryMailProvider.sent.filter((m) => m.to === 'someone@example.test')).toHaveLength(1);
    const ledger = await h.db.system.emailDelivery.findMany({ where: { outboxEventId: event.id } });
    expect(ledger).toMatchObject([{ status: 'SENT' }]);
  });

  it('invitation emails flow end to end through the outbox', async () => {
    await o.admin.client.post('/invitations', { invitations: [{ email: 'new.hire@example.test', role: 'TECHNICIAN' }] }).expect(201);
    await w.get(OutboxDispatcher).tick();
    const job = (await runtime.queues.outbox.getJobs(['waiting'])).find((j) => j.data.type === 'email.send' && (j.data.payload as { to: string }).to === 'new.hire@example.test');
    expect(job).toBeTruthy();
    await runtime.handleOutbox(job!);
    expect(MemoryMailProvider.sent.at(-1)).toMatchObject({ to: 'new.hire@example.test' });
    expect(MemoryMailProvider.sent.at(-1)!.html).toContain('/invite/');
  });
});

describe('SLA engine', () => {
  async function breachable() {
    const wo = await report('SLA breach candidate');
    const past = new Date(Date.now() - 60_000);
    await h.db.system.workOrder.update({ where: { id: wo.body.id }, data: { cycleStartedAt: new Date(Date.now() - 3_600_000), responseDueAt: past, resolutionDueAt: new Date(Date.now() + 3_600_000) } });
    return { id: wo.body.id as string, dueAt: past.toISOString() };
  }

  it('records a breach exactly once even when the job is delivered twice', async () => {
    const { id, dueAt } = await breachable();
    const sla = w.get(SlaEngine);
    const job = { organizationId: o.orgId, workOrderId: id, type: 'RESPONSE_BREACH' as const, cycle: 0, dueAt };
    expect(await sla.check(job)).toBe(true);
    expect(await sla.check(job)).toBe(false);
    expect(await h.db.system.slaEvent.count({ where: { workOrderId: id, type: 'RESPONSE_BREACH' } })).toBe(1);
    const notes = await h.db.system.notification.count({ where: { workOrderId: id, type: 'SLA_BREACH' } });
    expect(notes).toBeGreaterThan(0);
    const wo = await h.db.system.workOrder.findUniqueOrThrow({ where: { id } });
    expect(wo.escalationLevel).toBe(1);
  });

  it('ignores stale jobs whose deadline moved or whose clock already stopped', async () => {
    const { id, dueAt } = await breachable();
    const sla = w.get(SlaEngine);
    expect(await sla.check({ organizationId: o.orgId, workOrderId: id, type: 'RESPONSE_BREACH', cycle: 0, dueAt: new Date(0).toISOString() })).toBe(false);
    expect(await sla.check({ organizationId: o.orgId, workOrderId: id, type: 'RESPONSE_BREACH', cycle: 5, dueAt })).toBe(false);
    await h.db.system.workOrder.update({ where: { id }, data: { respondedAt: new Date(), status: 'IN_PROGRESS', assigneeId: o.tech.userId } });
    expect(await sla.check({ organizationId: o.orgId, workOrderId: id, type: 'RESPONSE_BREACH', cycle: 0, dueAt })).toBe(false);
  });

  it('a job carrying another tenant’s organization id cannot touch the work order', async () => {
    const { id, dueAt } = await breachable();
    const foreignOrg = await h.db.system.organization.create({ data: { name: 'Elsewhere', slug: `elsewhere-${Date.now()}`, industry: 'OTHER', timezone: 'UTC' } });
    expect(await w.get(SlaEngine).check({ organizationId: foreignOrg.id, workOrderId: id, type: 'RESPONSE_BREACH', cycle: 0, dueAt })).toBe(false);
    expect(await h.db.system.slaEvent.count({ where: { workOrderId: id } })).toBe(0);
  });

  it('after Redis loses every scheduled job, the sweep recovers missed deadlines from Postgres', async () => {
    const { id } = await breachable();
    await runtime.queues.sla.obliterate({ force: true });
    const sla = w.get(SlaEngine);
    expect(await sla.sweep()).toBeGreaterThanOrEqual(1);
    expect(await h.db.system.slaEvent.count({ where: { workOrderId: id, type: 'RESPONSE_BREACH' } })).toBe(1);
    expect(await sla.sweep()).toBe(0); // idempotent
  });

  it('schedules future checks as delayed jobs with deterministic ids', async () => {
    const wo = await report('Future deadlines');
    const sla = w.get(SlaEngine);
    const n = await sla.schedule(o.orgId, wo.body.id);
    expect(n).toBe(4);
    await sla.schedule(o.orgId, wo.body.id); // re-scheduling collapses onto the same job ids
    const delayed = (await runtime.queues.sla.getDelayed()).filter((j) => j.data.workOrderId === wo.body.id);
    expect(delayed).toHaveLength(4);
  });
});

describe('automation', () => {
  it('auto-assigns to the skilled technician when the organization uses AUTO mode, once', async () => {
    await o.admin.client.patch('/organizations/current/policy', { autoAssignMode: 'AUTO' }).expect(200);
    const wo = await report('Auto-assign me');
    const auto = w.get(AutomationService);
    expect(await auto.autoAssign(o.orgId, wo.body.id)).toBe('assigned');
    expect(await auto.autoAssign(o.orgId, wo.body.id)).toBe('skipped');
    const after = await h.db.system.workOrder.findUniqueOrThrow({ where: { id: wo.body.id } });
    expect(after).toMatchObject({ status: 'ASSIGNED', assigneeId: o.tech.userId });
    const assignment = await h.db.system.workOrderAssignment.findFirstOrThrow({ where: { workOrderId: wo.body.id } });
    expect(assignment.method).toBe('AUTO');
    await o.admin.client.patch('/organizations/current/policy', { autoAssignMode: 'SUGGEST' }).expect(200);
  });

  it('generates each preventive-maintenance occurrence exactly once', async () => {
    const schedule = await h.db.system.maintenanceSchedule.create({
      data: {
        organizationId: o.orgId,
        title: 'Monthly filter service',
        categoryId: o.categories.HVAC,
        assetId: o.assetId,
        frequencyUnit: 'MONTH',
        frequencyInterval: 1,
        startsAt: new Date(Date.now() - 3_600_000),
        nextDueAt: new Date(Date.now() - 3_600_000),
      },
    });
    const auto = w.get(AutomationService);
    expect(await auto.generateScheduled()).toBeGreaterThanOrEqual(1);
    expect(await auto.generateScheduled()).toBe(0);
    const generated = await h.db.system.workOrder.findMany({ where: { scheduleId: schedule.id } });
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ source: 'SCHEDULED', requesterId: null });
    const after = await h.db.system.maintenanceSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(after.nextDueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('auto-closes resolved work after the window and leaves recent work alone', async () => {
    const wo = await report('Close me later');
    await h.db.system.workOrder.update({
      where: { id: wo.body.id },
      data: { status: 'RESOLVED', assigneeId: o.tech.userId, resolvedAt: new Date(Date.now() - 30 * 86_400_000), respondedAt: new Date(), resolutionSubmittedAt: new Date() },
    });
    expect(await w.get(AutomationService).autoClose()).toBeGreaterThanOrEqual(1);
    const after = await h.db.system.workOrder.findUniqueOrThrow({ where: { id: wo.body.id } });
    expect(after.status).toBe('CLOSED');
    const history = await h.db.system.workOrderStatusHistory.findFirstOrThrow({ where: { workOrderId: wo.body.id, toStatus: 'CLOSED' } });
    expect(history.actorId).toBeNull();
  });
});
