import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { Prisma, type Database } from '@fixflow/db';
import { ENV, type Env } from '../config/env.js';
import { OUTBOX_NUDGE_CHANNEL } from '../infra/outbox.service.js';
import { createRedis } from '../infra/redis.js';
import { DATABASE } from '../infra/tokens.js';
import type { OutboxJobData } from './queues.js';

const BATCH = 100;
const LEASE_SECONDS = 30;
const MAX_ATTEMPTS = 10;

interface ClaimedRow {
  id: string;
  type: string;
  organization_id: string | null;
  payload: unknown;
  attempts: number;
}

/**
 * Moves committed outbox rows into BullMQ.
 *
 *  - Claims rows with `FOR UPDATE SKIP LOCKED` + a short lease, so several workers can run
 *    side by side without double-claiming; a crashed worker's lease simply expires.
 *  - Enqueues with `jobId = outbox id`: BullMQ ignores a second add with the same id, so a
 *    retry after a partial failure cannot create duplicate jobs.
 *  - Marks DISPATCHED only after the enqueue succeeded; repeated failures end in DEAD
 *    (visible in /health/ready and the logs) instead of retrying forever.
 * Uses the system role: the outbox is drained across tenants by design (audited system path).
 */
@Injectable()
export class OutboxDispatcher implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private subscriber: Redis | null = null;
  private running = false;
  private again = false;
  private stopped = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private queue!: Queue<OutboxJobData>;

  /** Binds the target queue without starting background polling (tests drive `tick()`). */
  attach(queue: Queue<OutboxJobData>): void {
    this.queue = queue;
  }

  start(queue: Queue<OutboxJobData>): void {
    this.attach(queue);
    this.timer = setInterval(() => void this.tick(), this.env.OUTBOX_POLL_MS);
    // Low-latency path: the API publishes a nudge right after committing.
    this.subscriber = createRedis(this.env.REDIS_URL);
    void this.subscriber.subscribe(OUTBOX_NUDGE_CHANNEL);
    this.subscriber.on('message', () => void this.tick());
    void this.tick();
  }

  /** One dispatch pass (also called directly by tests). Returns the number of rows dispatched. */
  async tick(): Promise<number> {
    if (this.stopped) return 0;
    if (this.running) {
      this.again = true;
      return 0;
    }
    this.running = true;
    let total = 0;
    try {
      do {
        this.again = false;
        const n = await this.dispatchBatch();
        total += n;
        if (n === BATCH) this.again = true;
      } while (this.again && !this.stopped);
    } catch (err) {
      this.logger.error({ err }, 'Outbox dispatch failed');
    } finally {
      this.running = false;
    }
    return total;
  }

  private async dispatchBatch(): Promise<number> {
    const rows = await this.db.system.$queryRaw<ClaimedRow[]>(Prisma.sql`
      UPDATE outbox_events
         SET attempts = attempts + 1,
             available_at = now() + make_interval(secs => ${LEASE_SECONDS})
       WHERE id IN (
         SELECT id FROM outbox_events
          WHERE status = 'PENDING' AND available_at <= now()
          ORDER BY created_at
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED)
      RETURNING id, type, organization_id, payload, attempts`);
    for (const row of rows) {
      try {
        await this.queue.add(
          row.type,
          { outboxId: row.id, organizationId: row.organization_id, type: row.type, payload: row.payload },
          { jobId: row.id },
        );
        await this.db.system.outboxEvent.update({ where: { id: row.id }, data: { status: 'DISPATCHED', dispatchedAt: new Date(), lastError: null } });
      } catch (err) {
        const dead = row.attempts >= MAX_ATTEMPTS;
        await this.db.system.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: dead ? 'DEAD' : 'PENDING',
            lastError: String((err as Error).message ?? err).slice(0, 1000),
            availableAt: new Date(Date.now() + Math.min(300_000, 2 ** row.attempts * 1000)),
          },
        });
        this.logger.warn({ outboxId: row.id, attempts: row.attempts, dead }, 'Outbox enqueue failed');
      }
    }
    return rows.length;
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.subscriber?.quit().catch(() => undefined);
  }
}
