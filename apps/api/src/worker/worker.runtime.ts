import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import type { OutboxEventMap } from '../infra/outbox.service.js';
import { AutomationService } from './automation.service.js';
import { EmailProcessor } from './email.processor.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { bullConnection, DEFAULT_JOB_OPTIONS, QUEUES, type OutboxJobData, type SlaJobData } from './queues.js';
import { SlaEngine } from './sla.engine.js';

/** Repeatable maintenance jobs (fixed scheduler ids → restarts never duplicate them). */
const SCHEDULERS = [
  { id: 'sla-sweep', every: 60_000 },
  { id: 'auto-close', every: 15 * 60_000 },
  { id: 'preventive-maintenance', every: 5 * 60_000 },
  { id: 'housekeeping', every: 6 * 3_600_000 },
] as const;

@Injectable()
export class WorkerRuntime implements OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private readonly connections: Redis[] = [];
  private readonly workers: Worker[] = [];
  readonly queues: { outbox: Queue<OutboxJobData>; sla: Queue<SlaJobData>; maintenance: Queue };

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly dispatcher: OutboxDispatcher,
    private readonly email: EmailProcessor,
    private readonly sla: SlaEngine,
    private readonly automation: AutomationService,
  ) {
    const conn = () => {
      const c = bullConnection(env.REDIS_URL);
      this.connections.push(c);
      return c;
    };
    this.queues = {
      outbox: new Queue<OutboxJobData>(QUEUES.outbox, { connection: conn(), defaultJobOptions: DEFAULT_JOB_OPTIONS }),
      sla: new Queue<SlaJobData>(QUEUES.sla, { connection: conn(), defaultJobOptions: DEFAULT_JOB_OPTIONS }),
      maintenance: new Queue(QUEUES.maintenance, { connection: conn(), defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 1 } }),
    };
    this.sla.attach(this.queues.sla);
  }

  async start(): Promise<void> {
    const conn = () => {
      const c = bullConnection(this.env.REDIS_URL);
      this.connections.push(c);
      return c;
    };
    this.workers.push(
      new Worker<OutboxJobData>(QUEUES.outbox, (job) => this.handleOutbox(job), { connection: conn(), concurrency: 8 }),
      new Worker<SlaJobData>(QUEUES.sla, (job) => this.sla.check(job.data), { connection: conn(), concurrency: 4 }),
      new Worker(QUEUES.maintenance, (job) => this.handleMaintenance(job.name), { connection: conn(), concurrency: 1 }),
    );
    for (const w of this.workers) {
      w.on('failed', (job, err) => this.logger.warn({ queue: w.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
      w.on('error', (err) => this.logger.error({ queue: w.name, err }, 'Worker error'));
    }
    if (!this.env.DISABLE_SCHEDULERS) {
      for (const s of SCHEDULERS) {
        await this.queues.maintenance.upsertJobScheduler(s.id, { every: s.every }, { name: s.id });
      }
    }
    this.dispatcher.start(this.queues.outbox);
    this.logger.log('FixFlow worker started (outbox, sla, maintenance)');
  }

  /** Routes outbox events to idempotent processors. */
  async handleOutbox(job: Job<OutboxJobData>): Promise<unknown> {
    const { outboxId, organizationId, type, payload } = job.data;
    switch (type) {
      case 'email.send':
        return this.email.direct(outboxId, organizationId, payload as OutboxEventMap['email.send']);
      case 'notifications.email':
        return this.email.notifications(outboxId, organizationId!, payload as OutboxEventMap['notifications.email']);
      case 'sla.schedule':
        return this.sla.schedule(organizationId!, (payload as OutboxEventMap['sla.schedule']).workOrderId);
      case 'workOrder.autoAssign':
        return this.automation.autoAssign(organizationId!, (payload as OutboxEventMap['workOrder.autoAssign']).workOrderId);
      default:
        this.logger.warn({ type }, 'Unknown outbox event type — ignored');
        return null;
    }
  }

  async handleMaintenance(name: string): Promise<unknown> {
    switch (name) {
      case 'sla-sweep':
        return this.sla.sweep();
      case 'auto-close':
        return this.automation.autoClose();
      case 'preventive-maintenance':
        return this.automation.generateScheduled();
      case 'housekeeping':
        return this.automation.housekeeping();
      default:
        return null;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Finish in-flight jobs, then release connections (graceful SIGTERM handling).
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled(Object.values(this.queues).map((q) => q.close()));
    await Promise.allSettled(this.connections.map((c) => c.quit()));
  }
}
