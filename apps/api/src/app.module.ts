import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from './config/env.js';
import { AuthGuard, CsrfGuard, PermissionsGuard, TenantGuard } from './common/auth/guards.js';
import { IdempotencyInterceptor } from './common/idempotency.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { InfraModule } from './infra/infra.module.js';
import { RedisThrottlerStorage } from './infra/throttler-redis.storage.js';
import { REDIS } from './infra/tokens.js';
import { FEATURE_MODULES } from './modules/index.js';

const env = loadEnv();

export const loggerModule = LoggerModule.forRoot({
  pinoHttp: {
    level: env.LOG_LEVEL,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    customProps: (req) => ({ userId: (req as { auth?: { userId: string } }).auth?.userId }),
    autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } } : undefined,
  },
});

@Module({
  imports: [
    loggerModule,
    InfraModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true',
      }),
    }),
    ...FEATURE_MODULES,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Guard order matters: rate limit → authenticate → CSRF → tenant membership → permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
