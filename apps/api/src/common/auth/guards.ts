import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import type { Database } from '@fixflow/db';
import { ROLE_PERMISSIONS, type Permission, type Role } from '@fixflow/shared';
import { AppError, forbidden, unauthenticated } from '../errors.js';
import { JwtService } from '../../infra/jwt.service.js';
import { keys } from '../../infra/redis.js';
import { DATABASE, REDIS } from '../../infra/tokens.js';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER } from './cookies.js';
import { IS_PUBLIC, PERMISSIONS, SKIP_CSRF, SKIP_TENANT } from './decorators.js';

const flag = (reflector: Reflector, key: string, ctx: ExecutionContext) =>
  reflector.getAllAndOverride<boolean>(key, [ctx.getHandler(), ctx.getClass()]) === true;

/**
 * 1) Authentication: verifies the access token (httpOnly cookie, or Bearer for API clients)
 *    and rejects sessions revoked since the token was issued.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const isPublic = flag(this.reflector, IS_PUBLIC, ctx);

    const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    const token = bearer ?? cookie;
    if (!token) {
      if (isPublic) return true;
      throw unauthenticated();
    }
    const claims = await this.jwt.verify(token);
    if (!claims || (await this.redis.exists(keys.revokedSession(claims.sid)))) {
      if (isPublic) return true;
      throw unauthenticated('Your session has expired', 'SESSION_EXPIRED');
    }
    req.auth = { userId: claims.sub, sessionId: claims.sid, organizationId: claims.org, via: bearer ? 'bearer' : 'cookie' };
    return true;
  }
}

/**
 * 2) CSRF: double-submit token for every state-changing request made with cookies.
 *    Combined with SameSite=Lax cookies and a strict CORS allowlist.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (flag(this.reflector, SKIP_CSRF, ctx)) return true;
    if (req.auth?.via === 'bearer') return true; // not ambient credentials → not CSRF-able
    const cookie = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
    const header = req.get(CSRF_HEADER);
    if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
      throw new AppError(403, 'CSRF_FAILED', 'Security token missing or invalid. Refresh the page and try again.');
    }
    return true;
  }
}

interface CachedMembership {
  id: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
}

/**
 * 3) Tenant: the organization claimed by the token must match an ACTIVE membership,
 *    re-verified on every request (short Redis cache, invalidated on membership changes).
 *    This is where the trusted tenant context (`req.actor.ctx`) is created.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    if (flag(this.reflector, IS_PUBLIC, ctx) || flag(this.reflector, SKIP_TENANT, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.auth;
    if (!auth) throw unauthenticated();
    if (!auth.organizationId) {
      throw new AppError(403, 'NO_ACTIVE_ORGANIZATION', 'Create or select an organization to continue');
    }
    const membership = await this.loadMembership(auth.organizationId, auth.userId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw forbidden('You are no longer a member of this organization');
    }
    req.actor = {
      userId: auth.userId,
      sessionId: auth.sessionId,
      organizationId: auth.organizationId,
      membershipId: membership.id,
      role: membership.role,
      permissions: ROLE_PERMISSIONS[membership.role],
      ctx: { organizationId: auth.organizationId, userId: auth.userId },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    };
    return true;
  }

  private async loadMembership(orgId: string, userId: string): Promise<CachedMembership | null> {
    const key = keys.membership(orgId, userId);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as CachedMembership;
    // Read under the claimed tenant's RLS context: rows exist only if the membership is real.
    const m = await this.db.tx({ organizationId: orgId, userId }, (tx) =>
      tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        select: { id: true, role: true, status: true },
      }),
    );
    if (m) await this.redis.set(key, JSON.stringify(m), 'EX', 60);
    return m;
  }
}

/** 4) Coarse role permissions declared with @RequirePermissions(...). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const actor = ctx.switchToHttp().getRequest<Request>().actor;
    if (!actor) throw forbidden();
    if (!required.every((p) => actor.permissions.has(p))) throw forbidden();
    return true;
  }
}
