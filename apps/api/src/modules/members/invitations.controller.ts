import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  acceptInvitationSchema,
  createInvitationsSchema,
  type AcceptInvitationInput,
  type CreateInvitationsInput,
  type InvitationDto,
  type MeResponse,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { Actor } from '../../common/auth/actor.js';
import { ACCESS_COOKIE, setSessionCookies } from '../../common/auth/cookies.js';
import { ClientInfo, CurrentActor, OptionalAuth, Public, RequirePermissions } from '../../common/auth/decorators.js';
import type { AuthState } from '../../common/auth/actor.js';
import { badRequest } from '../../common/errors.js';
import { UuidParamPipe, ZBody } from '../../common/zod.js';
import { AuthService } from '../auth/auth.service.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('team')
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @RequirePermissions('invitation.manage')
  list(@CurrentActor() actor: Actor): Promise<InvitationDto[]> {
    return this.invitations.list(actor);
  }

  @Post()
  @RequirePermissions('invitation.manage')
  create(@CurrentActor() actor: Actor, @ZBody(createInvitationsSchema) body: CreateInvitationsInput) {
    return this.invitations.create(actor, body);
  }

  @Post(':id/revoke')
  @HttpCode(204)
  @RequirePermissions('invitation.manage')
  revoke(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.invitations.revoke(actor, id);
  }

  @Post(':id/resend')
  @HttpCode(200)
  @RequirePermissions('invitation.manage')
  resend(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<InvitationDto> {
    return this.invitations.resend(actor, id);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('lookup')
  @ApiOperation({ summary: 'Public: describe an invitation for the acceptance screen' })
  lookup(@Query('token') token: string | undefined) {
    if (!token || token.length < 20 || token.length > 200) throw badRequest('Invalid invitation link', 'INVALID_TOKEN');
    return this.invitations.lookup(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an invitation (signs in new users)' })
  async accept(
    @ZBody(acceptInvitationSchema) body: AcceptInvitationInput,
    @OptionalAuth() auth: AuthState | null,
    @ClientInfo() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const result = await this.invitations.accept(body, auth, client);
    const cookie = { httpOnly: true, secure: this.env.COOKIE_SECURE, sameSite: 'lax' as const, path: '/', maxAge: this.env.ACCESS_TOKEN_TTL_SECONDS * 1000 };
    if (result.tokens) {
      setSessionCookies(
        res,
        { secure: this.env.COOKIE_SECURE, accessTtlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS, refreshTtlDays: this.env.REFRESH_TOKEN_TTL_DAYS },
        result.tokens,
        (req.cookies as Record<string, string> | undefined)?.ff_csrf,
      );
      return this.auth.me({ userId: result.userId, sessionId: result.tokens.sessionId, organizationId: result.organizationId, via: 'cookie' });
    }
    const token = await this.auth.reissueAccessToken(auth!.userId, auth!.sessionId, result.organizationId);
    res.cookie(ACCESS_COOKIE, token, cookie);
    return this.auth.me({ ...auth!, organizationId: result.organizationId });
  }
}
