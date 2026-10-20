import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { isUniqueViolation, type Database, type Prisma } from '@fixflow/db';
import { DATABASE } from '../infra/tokens.js';
import { AppError } from './errors.js';

export const IDEMPOTENT = 'fixflow:idempotent';
/** Marks a mutating endpoint as safe to retry with an `Idempotency-Key` header. */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

const KEY_RE = /^[\w-]{8,100}$/;
const TTL_MS = 24 * 3_600_000;
const IN_PROGRESS = 0;

/**
 * Exactly-once semantics for retried mutations (offline outbox, flaky networks):
 *  1. reserve (user, key) with a unique insert BEFORE running the handler — a concurrent
 *     duplicate sees the reservation and gets 409 instead of executing twice;
 *  2. on success store the status + body; later retries with the same key replay it;
 *  3. a key reused with a different payload is rejected (422);
 *  4. on failure the reservation is released so the client may retry.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http' || !this.reflector.get<boolean>(IDEMPOTENT, ctx.getHandler())) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.get('idempotency-key');
    const actor = req.actor;
    if (!key || !actor) return next.handle();
    if (!KEY_RE.test(key)) throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid Idempotency-Key');

    const isMultipart = req.is('multipart/form-data');
    const requestHash = createHash('sha256')
      .update(`${req.method} ${req.path}\n${isMultipart ? `multipart:${req.get('content-length') ?? ''}` : JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    return from(
      (async () => {
        const reserved = await this.reserve(actor.ctx, actor.organizationId, actor.userId, key, requestHash);
        if (reserved !== 'reserved') {
          if (reserved.requestHash !== requestHash) {
            throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
          }
          if (reserved.statusCode === IN_PROGRESS) {
            throw new AppError(HttpStatus.CONFLICT, 'CONFLICT', 'The original request is still being processed; retry shortly');
          }
          res.status(reserved.statusCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return reserved.responseBody;
        }
        try {
          const body = await lastValueFrom(next.handle(), { defaultValue: undefined });
          await this.db.tx(actor.ctx, (tx) =>
            tx.idempotencyRecord.update({
              where: { userId_key: { userId: actor.userId, key } },
              data: { statusCode: res.statusCode || 200, responseBody: (body ?? null) as Prisma.InputJsonValue },
            }),
          );
          return body;
        } catch (err) {
          await this.db
            .tx(actor.ctx, (tx) => tx.idempotencyRecord.deleteMany({ where: { userId: actor.userId, key, statusCode: IN_PROGRESS } }))
            .catch(() => undefined);
          throw err;
        }
      })(),
    );
  }

  private async reserve(
    ctx: { organizationId: string; userId: string | null },
    organizationId: string,
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<'reserved' | { requestHash: string; statusCode: number; responseBody: unknown }> {
    try {
      await this.db.tx(ctx, (tx) =>
        tx.idempotencyRecord.create({
          data: { organizationId, userId, key, requestHash, statusCode: IN_PROGRESS, responseBody: {}, expiresAt: new Date(Date.now() + TTL_MS) },
          select: { id: true },
        }),
      );
      return 'reserved';
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await this.db.tx(ctx, (tx) =>
        tx.idempotencyRecord.findUnique({ where: { userId_key: { userId, key } }, select: { requestHash: true, statusCode: true, responseBody: true } }),
      );
      if (!existing) return this.reserve(ctx, organizationId, userId, key, requestHash);
      return existing;
    }
  }
}

