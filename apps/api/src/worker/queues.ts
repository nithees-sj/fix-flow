import type { DefaultJobOptions } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUES = {
  outbox: 'fixflow-outbox',
  sla: 'fixflow-sla',
  maintenance: 'fixflow-maintenance',
} as const;

/** BullMQ needs dedicated connections with maxRetriesPerRequest = null for blocking commands. */
export function bullConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}

/** Retries with exponential backoff; finished jobs are trimmed so Redis memory stays bounded. */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export interface SlaJobData {
  organizationId: string;
  workOrderId: string;
  type: 'RESPONSE_WARNING' | 'RESPONSE_BREACH' | 'RESOLUTION_WARNING' | 'RESOLUTION_BREACH';
  cycle: number;
  dueAt: string;
}

export interface OutboxJobData {
  outboxId: string;
  organizationId: string | null;
  type: string;
  payload: unknown;
}
