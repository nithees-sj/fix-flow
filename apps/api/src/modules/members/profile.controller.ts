import { Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Database } from '@fixflow/db';
import { changePasswordSchema, updateProfileSchema, type ChangePasswordInput, type MeResponse, type UpdateProfileInput } from '@fixflow/shared';
import type { AuthState } from '../../common/auth/actor.js';
import { CurrentAuth, NoTenant } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody } from '../../common/zod.js';
import { DATABASE } from '../../infra/tokens.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionService } from '../auth/session.service.js';

@ApiTags('profile')
@NoTenant()
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Patch()
  async update(@CurrentAuth() auth: AuthState, @ZBody(updateProfileSchema) body: UpdateProfileInput): Promise<MeResponse> {
    await this.db.userTx(auth.userId, (tx) => tx.user.update({ where: { id: auth.userId }, data: { name: body.name, phone: body.phone ?? null } }));
    return this.auth.me(auth);
  }

  @Post('password')
  @HttpCode(204)
  changePassword(@CurrentAuth() auth: AuthState, @ZBody(changePasswordSchema) body: ChangePasswordInput): Promise<void> {
    return this.auth.changePassword(auth, body);
  }

  @Get('sessions')
  async listSessions(@CurrentAuth() auth: AuthState) {
    const family = await this.sessions.familyOf(auth.sessionId);
    const rows = await this.db.userTx(auth.userId, (tx) =>
      tx.session.findMany({
        where: { userId: auth.userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true, familyId: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
      }),
    );
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.familyId === family,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentAuth() auth: AuthState, @Param('id', UuidParamPipe) id: string): Promise<void> {
    const owned = await this.db.userTx(auth.userId, (tx) => tx.session.count({ where: { id, userId: auth.userId } }));
    if (!owned) throw notFound('Session');
    await this.sessions.revoke(id, auth.userId);
  }
}
