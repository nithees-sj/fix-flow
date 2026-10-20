import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isUniqueViolation, type Database } from '@fixflow/db';
import {
  permissionsFor,
  type ChangePasswordInput,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { AuthState } from '../../common/auth/actor.js';
import type { ClientInfo } from '../../common/auth/decorators.js';
import { AppError, badRequest, forbidden, unauthenticated } from '../../common/errors.js';
import { JwtService } from '../../infra/jwt.service.js';
import { OutboxService } from '../../infra/outbox.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { hashPassword, newSecret, sha256, verifyPassword } from './crypto.js';
import { type IssuedTokens, SessionService } from './session.service.js';

const RESET_TTL_MS = 30 * 60_000;
const VERIFY_TTL_MS = 48 * 3_600_000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionService,
    private readonly outbox: OutboxService,
    private readonly jwt: JwtService,
  ) {}

  /** System path: account creation happens before any tenant/user context exists. */
  async register(input: RegisterInput, client: ClientInfo): Promise<IssuedTokens> {
    const passwordHash = await hashPassword(input.password);
    const verify = newSecret();
    try {
      const user = await this.db.system.$transaction(async (tx) => {
        const u = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash }, select: { id: true } });
        await tx.userToken.create({
          data: { userId: u.id, type: 'EMAIL_VERIFY', tokenHash: verify.hash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
        });
        await this.outbox.add(tx, null, 'email.send', {
          to: input.email,
          template: 'verify-email',
          data: { name: input.name, url: `${this.env.APP_WEB_URL}/verify-email?token=${verify.token}` },
        });
        return u;
      });
      this.outbox.nudge();
      return this.sessions.create(user.id, null, client);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
      }
      throw e;
    }
  }

  async login(input: LoginInput, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.db.system.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(user?.passwordHash ?? null, input.password);
    if (!user || !ok) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    const org = await this.pickLandingOrganization(user.id);
    await this.db.system.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.sessions.create(user.id, org, client);
  }

  /** Last used organization if still active, otherwise the oldest active membership. */
  private async pickLandingOrganization(userId: string): Promise<string | null> {
    const last = await this.db.system.session.findFirst({
      where: { userId, activeOrganizationId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { activeOrganizationId: true },
    });
    const memberships = await this.db.userTx(userId, (tx) =>
      tx.membership.findMany({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { organizationId: true } }),
    );
    if (last?.activeOrganizationId && memberships.some((m) => m.organizationId === last.activeOrganizationId)) {
      return last.activeOrganizationId;
    }
    return memberships[0]?.organizationId ?? null;
  }

  async switchOrganization(auth: AuthState, organizationId: string): Promise<string> {
    const membership = await this.db.userTx(auth.userId, (tx) =>
      tx.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId: auth.userId } },
        select: { status: true },
      }),
    );
    if (membership?.status !== 'ACTIVE') throw forbidden('You are not a member of that organization');
    await this.sessions.setActiveOrganization(auth.sessionId, organizationId);
    return this.reissueAccessToken(auth.userId, auth.sessionId, organizationId);
  }

  reissueAccessToken(userId: string, sessionId: string, organizationId: string | null): Promise<string> {
    return this.jwt.sign({ sub: userId, sid: sessionId, org: organizationId });
  }

  async me(auth: AuthState): Promise<MeResponse> {
    const user = await this.db.userTx(auth.userId, (tx) =>
      tx.user.findUnique({
        where: { id: auth.userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          emailVerifiedAt: true,
          memberships: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
            select: { role: true, isAvailable: true, organization: { select: { id: true, name: true, slug: true, industry: true, timezone: true, onboardingCompletedAt: true } } },
          },
        },
      }),
    );
    if (!user) throw unauthenticated();
    const active = user.memberships.find((m) => m.organization.id === auth.organizationId);
    return {
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, emailVerified: !!user.emailVerifiedAt },
      activeOrganization: active
        ? {
            id: active.organization.id,
            name: active.organization.name,
            slug: active.organization.slug,
            industry: active.organization.industry,
            timezone: active.organization.timezone,
            role: active.role,
            permissions: permissionsFor(active.role),
            onboardingCompleted: !!active.organization.onboardingCompletedAt,
            isAvailable: active.isAvailable,
          }
        : null,
      memberships: user.memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  /** Always succeeds from the caller's perspective (no account enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.db.system.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!user) return;
    const secret = newSecret();
    await this.db.system.$transaction(async (tx) => {
      await tx.userToken.updateMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.userToken.create({
        data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: secret.hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      await this.outbox.add(tx, null, 'email.send', {
        to: user.email,
        template: 'password-reset',
        data: { name: user.name, url: `${this.env.APP_WEB_URL}/reset-password?token=${secret.token}` },
      });
    });
    this.outbox.nudge();
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.db.system.userToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw badRequest('This reset link is invalid or has expired. Request a new one.', 'INVALID_TOKEN');
    }
    const passwordHash = await hashPassword(password);
    await this.db.system.$transaction(async (tx) => {
      const used = await tx.userToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count === 0) throw badRequest('This reset link was already used.', 'INVALID_TOKEN');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, emailVerifiedAt: new Date() } });
      await this.outbox.add(tx, null, 'email.send', { to: record.user.email, template: 'password-changed', data: { name: record.user.name } });
    });
    await this.sessions.revokeAllForUser(record.userId);
    this.outbox.nudge();
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.db.system.userToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== 'EMAIL_VERIFY' || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw badRequest('This verification link is invalid or has expired.', 'INVALID_TOKEN');
    }
    await this.db.system.$transaction([
      this.db.system.userToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.db.system.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
  }

  async resendVerification(auth: AuthState): Promise<void> {
    const user = await this.db.system.user.findUnique({ where: { id: auth.userId }, select: { name: true, email: true, emailVerifiedAt: true } });
    if (!user || user.emailVerifiedAt) return;
    const secret = newSecret();
    await this.db.system.$transaction(async (tx) => {
      await tx.userToken.create({
        data: { userId: auth.userId, type: 'EMAIL_VERIFY', tokenHash: secret.hash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
      });
      await this.outbox.add(tx, null, 'email.send', {
        to: user.email,
        template: 'verify-email',
        data: { name: user.name, url: `${this.env.APP_WEB_URL}/verify-email?token=${secret.token}` },
      });
    });
    this.outbox.nudge();
  }

  async changePassword(auth: AuthState, input: ChangePasswordInput): Promise<void> {
    const user = await this.db.system.user.findUnique({ where: { id: auth.userId }, select: { passwordHash: true, name: true, email: true } });
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'INVALID_CREDENTIALS', 'Your current password is incorrect.', {
        errors: [{ path: 'currentPassword', message: 'Incorrect password' }],
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.db.userTx(auth.userId, (tx) => tx.user.update({ where: { id: auth.userId }, data: { passwordHash } }));
    await this.db.system.$transaction(async (tx) => {
      await this.outbox.add(tx, null, 'email.send', { to: user.email, template: 'password-changed', data: { name: user.name } });
    });
    const family = await this.sessions.familyOf(auth.sessionId);
    await this.sessions.revokeAllForUser(auth.userId, family ?? undefined);
    this.outbox.nudge();
  }
}
