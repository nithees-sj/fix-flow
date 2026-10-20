import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Database } from '@fixflow/db';
import { ENV, type Env, loadEnv } from '../config/env.js';
import { AuditService } from './audit.service.js';
import { JwtService } from './jwt.service.js';
import { MailService } from './mail/mail.service.js';
import { OutboxService } from './outbox.service.js';
import { RealtimePublisher } from './realtime.publisher.js';
import { createRedis } from './redis.js';
import { StorageService } from './storage.service.js';
import { DATABASE, REDIS } from './tokens.js';

const logger = new Logger('Infra');

/** Process-wide infrastructure shared by the HTTP API and the worker. */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: DATABASE,
      inject: [ENV],
      useFactory: (env: Env) =>
        new Database({
          appUrl: env.DATABASE_URL,
          systemUrl: env.DATABASE_SYSTEM_URL,
          poolSize: env.DATABASE_POOL_SIZE,
          onPoolError: (err) => logger.error({ err }, 'Postgres pool error'),
        }),
    },
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const redis = createRedis(env.REDIS_URL);
        redis.on('error', (err) => logger.error({ err }, 'Redis error'));
        return redis;
      },
    },
    JwtService,
    StorageService,
    MailService,
    OutboxService,
    AuditService,
    RealtimePublisher,
  ],
  exports: [ENV, DATABASE, REDIS, JwtService, StorageService, MailService, OutboxService, AuditService, RealtimePublisher],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.disconnect().catch(() => undefined);
    this.redis.disconnect();
  }
}
