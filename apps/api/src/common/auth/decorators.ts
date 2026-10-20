import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '@fixflow/shared';
import { AppError, unauthenticated } from '../errors.js';
import type { Actor, AuthState } from './actor.js';

export const IS_PUBLIC = 'fixflow:isPublic';
export const SKIP_TENANT = 'fixflow:skipTenant';
export const SKIP_CSRF = 'fixflow:skipCsrf';
export const PERMISSIONS = 'fixflow:permissions';

/** No authentication required (an access token, if present, is still parsed). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Authenticated, but no active organization needed (account-level endpoints). */
export const NoTenant = () => SetMetadata(SKIP_TENANT, true);

/** Only for endpoints whose request cannot carry the CSRF header (none in the browser app). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

/** Coarse role capability check, enforced by PermissionsGuard before the handler runs. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.actor) throw new AppError(403, 'NO_ACTIVE_ORGANIZATION', 'Select an organization first');
  return req.actor;
});

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthState => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw unauthenticated();
  return req.auth;
});

/** Optional auth on public endpoints. */
export const OptionalAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthState | null => {
  return ctx.switchToHttp().getRequest<Request>().auth ?? null;
});

export const ClientInfo = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null };
});
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}
