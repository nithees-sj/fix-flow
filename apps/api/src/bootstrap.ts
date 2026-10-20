import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { RealtimeIoAdapter } from './modules/realtime/realtime.adapter.js';

export const API_PREFIX = 'api/v1';

/** Shared HTTP app configuration (used by main.ts and the integration tests). */
export async function createApp(env: Env, opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
    logger: opts.logger === false ? false : undefined,
  });
  if (opts.logger !== false) app.useLogger(app.get(Logger));

  // Behind a reverse proxy in production; needed for correct client IPs (rate limits, audit).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          // Swagger UI needs inline styles/scripts on /api/docs only.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key', 'x-request-id'],
    maxAge: 600,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, env));

  const config = new DocumentBuilder()
    .setTitle('FixFlow API')
    .setDescription(
      'REST API for FixFlow. Authentication uses httpOnly cookies (browser) or a Bearer access token. ' +
        'State-changing cookie requests must send the X-CSRF-Token header matching the ff_csrf cookie. ' +
        'Errors are RFC 9457 problem+json documents with a stable `code`.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('ff_at')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });

  return app;
}
