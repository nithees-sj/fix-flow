import { randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Database } from '@fixflow/db';
import { ENV, type Env } from '../../config/env.js';
import { AppError, unauthenticated } from '../../common/errors.js';
import { JwtService } from '../../infra/jwt.service.js';
import { keys } from '../../infra/redis.js';
import { DATABASE, REDIS } from '../../infra/tokens.js';
import { newSecret, sha256 } from './crypto.js';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  userId: string;
  organizationId: string | null;
}

/** Grace window in which a just-rotated refresh token is treated as a benign concurrent refresh. */
const ROTATION_GRACE_MS = 20_000;

/**
 * Refresh-token sessions with rotation and reuse detection.
 *
 *  - Every refresh issues a new token and marks the previous session row `rotatedAt`.
 *  - Presenting a rotated token after the grace window means it was stolen or replayed:
 *    the entire token family is revoked and every access token of the family is denylisted.
 *
 * All lookups by refresh token use the BYPASSRLS system client: the caller is not yet
 * authenticated, so there is no tenant/user context (documented system path).
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  async create(
    userId: string,
    activeOrganizationId: string | null,
    client: { ip: string | null; userAgent: string | null },
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const refresh = newSecret();
    const session = await this.db.system.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: refresh.hash,
        activeOrganizationId,
        ip: client.ip,
        userAgent: client.userAgent,
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
      select: { id: true },
    });
    return {
      sessionId: session.id,
      userId,
      organizationId: activeOrganizationId,
      refreshToken: refresh.token,
      accessToken: await this.jwt.sign({ sub: userId, sid: session.id, org: activeOrganizationId }),
      csrfToken: randomBytes(24).toString('base64url'),
    };
  }

  async rotate(refreshToken: string, client: { ip: string | null; userAgent: string | null }): Promise<IssuedTokens> {
    const current = await this.db.system.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!current) throw unauthenticated('Your session has expired', 'SESSION_EXPIRED');

    if (current.rotatedAt || current.revokedAt) {
      const recentlyRotated = current.rotatedAt && !current.revokedAt && Date.now() - current.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (recentlyRotated) {
        // Two tabs refreshed at once; the browser already holds the newer cookie.
        throw new AppError(HttpStatus.CONFLICT, 'CONFLICT', 'Session refreshed concurrently; retry the request.');
      }
      await this.revokeFamily(current.familyId, 'refresh-token-reuse');
      this.logger.warn({ userId: current.userId, familyId: current.familyId }, 'Refresh token reuse detected; session family revoked');
      throw unauthenticated('Your session has expired', 'SESSION_EXPIRED');
    }
    if (current.expiresAt.getTime() <= Date.now()) throw unauthenticated('Your session has expired', 'SESSION_EXPIRED');

    // Keep the active organization only if the membership is still active.
    let org = current.activeOrganizationId;
    if (org) {
      const m = await this.db.system.membership.findUnique({
        where: { organizationId_userId: { organizationId: org, userId: current.userId } },
        select: { status: true },
      });
      if (m?.status !== 'ACTIVE') org = null;
    }

    // Conditional update guarantees only one concurrent refresh wins the rotation.
    const won = await this.db.system.session.updateMany({
      where: { id: current.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date(), lastUsedAt: new Date() },
    });
    if (won.count === 0) throw new AppError(HttpStatus.CONFLICT, 'CONFLICT', 'Session refreshed concurrently; retry the request.');

    return this.create(current.userId, org, client, current.familyId);
  }

  /** Revoke one session (logout) and denylist its access tokens until they expire. */
  async revoke(sessionId: string, userId: string): Promise<void> {
    const s = await this.db.system.session.findFirst({ where: { id: sessionId, userId }, select: { familyId: true } });
    if (!s) return;
    await this.revokeFamily(s.familyId, 'logout');
  }

  async revokeAllForUser(userId: string, exceptFamilyId?: string): Promise<void> {
    const families = await this.db.system.session.findMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}) },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    for (const f of families) await this.revokeFamily(f.familyId, 'revoke-all');
  }

  async familyOf(sessionId: string): Promise<string | null> {
    const s = await this.db.system.session.findUnique({ where: { id: sessionId }, select: { familyId: true } });
    return s?.familyId ?? null;
  }

  async setActiveOrganization(sessionId: string, organizationId: string): Promise<void> {
    // Applies to the whole family so a later rotation keeps the choice.
    const s = await this.db.system.session.findUnique({ where: { id: sessionId }, select: { familyId: true } });
    if (!s) throw unauthenticated();
    await this.db.system.session.updateMany({ where: { familyId: s.familyId }, data: { activeOrganizationId: organizationId } });
  }

  private async revokeFamily(familyId: string, _reason: string): Promise<void> {
    const sessions = await this.db.system.session.findMany({ where: { familyId }, select: { id: true } });
    await this.db.system.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (sessions.length) {
      const pipeline = this.redis.pipeline();
      for (const s of sessions) pipeline.set(keys.revokedSession(s.id), '1', 'EX', this.env.ACCESS_TOKEN_TTL_SECONDS + 60);
      await pipeline.exec();
    }
  }
}
