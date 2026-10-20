import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type { Database } from '@fixflow/db';
import { Public } from '../../common/auth/decorators.js';
import { StorageService } from '../../infra/storage.service.js';
import { DATABASE, REDIS } from '../../infra/tokens.js';

type Check = { status: 'up' | 'down'; latencyMs: number; error?: string };

async function time(fn: () => Promise<unknown>): Promise<Check> {
  const start = performance.now();
  try {
    await fn();
    return { status: 'up', latencyMs: Math.round(performance.now() - start) };
  } catch (e) {
    return { status: 'down', latencyMs: Math.round(performance.now() - start), error: (e as Error).message.slice(0, 200) };
  }
}

@ApiTags('health')
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly storage: StorageService,
  ) {}

  /** Liveness: the process is up (used by container orchestrators). */
  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: dependencies reachable; returns 503 if any check fails. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis, storage, outbox] = await Promise.all([
      time(() => this.db.system.$queryRaw`SELECT 1`),
      time(() => this.redis.ping()),
      time(() => this.storage.ping()),
      this.db.system.outboxEvent
        .groupBy({ by: ['status'], _count: true })
        .then((rows) => Object.fromEntries(rows.map((r) => [r.status, r._count])))
        .catch(() => ({})),
    ]);
    const ok = [database, redis, storage].every((c) => c.status === 'up');
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', checks: { database, redis, storage }, outbox };
  }
}
