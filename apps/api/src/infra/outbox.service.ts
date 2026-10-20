import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Prisma, Tx } from '@fixflow/db';
import { REDIS } from './tokens.js';
import type { EmailTemplate } from './mail/templates.js';

/** Event types carried by the transactional outbox and their payloads. */
export interface OutboxEventMap {
  /** (Re)schedule SLA warning/breach checks for the work order's current cycle. */
  'sla.schedule': { workOrderId: string };
  /** Email copies of notifications for recipients who opted into email. */
  'notifications.email': {
    deliveries: { userId: string; title: string; body: string; workOrderId: string | null }[];
  };
  /** Direct transactional email (auth, invitations). */
  'email.send': { to: string } & EmailTemplate;
  /** Auto-assign a new work order when the organization uses AUTO mode. */
  'workOrder.autoAssign': { workOrderId: string };
}
export type OutboxEventType = keyof OutboxEventMap;

export const OUTBOX_NUDGE_CHANNEL = 'ff:outbox:nudge';

/**
 * Writes outbox rows inside the caller's transaction, so side effects are recorded
 * atomically with the business change. The worker dispatches them (at-least-once,
 * deduplicated by jobId) — see apps/api/src/worker/outbox.dispatcher.ts.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async add<T extends OutboxEventType>(
    tx: Tx,
    organizationId: string | null,
    type: T,
    payload: OutboxEventMap[T],
    aggregateId?: string,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: { organizationId, type, payload: payload as unknown as Prisma.InputJsonValue, aggregateId },
      select: { id: true },
    });
  }

  /** Best-effort low-latency hint after commit; correctness never depends on it. */
  nudge(): void {
    this.redis.publish(OUTBOX_NUDGE_CHANNEL, '1').catch(() => undefined);
  }
}
