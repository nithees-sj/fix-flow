import { randomBytes } from 'node:crypto';
import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  switchOrganizationSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
  type ResetPasswordInput,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { AuthState } from '../../common/auth/actor.js';
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  REFRESH_COOKIE,
  setCsrfCookie,
  setSessionCookies,
} from '../../common/auth/cookies.js';
import { ClientInfo, CurrentAuth, NoTenant, Public } from '../../common/auth/decorators.js';
import { unauthenticated } from '../../common/errors.js';
import { ZBody } from '../../common/zod.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import type { IssuedTokens } from './session.service.js';

const csrfFrom = (req: Request) => (req.cookies as Record<string, string> | undefined)?.ff_csrf;

const STRICT = { default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } };
const VERY_STRICT = { default: { limit: 5, ttl: 60_000, blockDuration: 5 * 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private cookieCfg() {
    return {
      secure: this.env.COOKIE_SECURE,
      accessTtlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: this.env.REFRESH_TOKEN_TTL_DAYS,
    };
  }

  private async respondWithSession(req: Request, res: Response, tokens: IssuedTokens): Promise<MeResponse> {
    setSessionCookies(res, this.cookieCfg(), tokens, csrfFrom(req));
    return this.auth.me({ userId: tokens.userId, sessionId: tokens.sessionId, organizationId: tokens.organizationId, via: 'cookie' });
  }

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Issue the double-submit CSRF cookie (call once before the first mutation)' })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const existing = (req.cookies as Record<string, string> | undefined)?.ff_csrf;
    const token = existing ?? randomBytes(24).toString('base64url');
    setCsrfCookie(res, this.env.COOKIE_SECURE, token);
    return { csrfToken: token };
  }

  @Public()
  @Throttle(VERY_STRICT)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(
    @ZBody(registerSchema) body: RegisterInput,
    @ClientInfo() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.respondWithSession(req, res, await this.auth.register(body, client));
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @ZBody(loginSchema) body: LoginInput,
    @ClientInfo() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.respondWithSession(req, res, await this.auth.login(body, client));
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token (httpOnly cookie) and issue a new access token' })
  async refresh(@Req() req: Request, @ClientInfo() client: ClientInfo, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw unauthenticated('Your session has expired', 'SESSION_EXPIRED');
    try {
      const issued = await this.sessions.rotate(token, client);
      setSessionCookies(res, this.cookieCfg(), issued, csrfFrom(req));
      return { ok: true };
    } catch (e) {
      if ((e as { code?: string }).code !== 'CONFLICT') clearSessionCookies(res, this.env.COOKIE_SECURE);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the current session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    if (req.auth) await this.sessions.revoke(req.auth.sessionId, req.auth.userId);
    clearSessionCookies(res, this.env.COOKIE_SECURE);
  }

  @NoTenant()
  @Get('me')
  @ApiOperation({ summary: 'Current user, active organization, permissions and memberships' })
  me(@CurrentAuth() auth: AuthState): Promise<MeResponse> {
    return this.auth.me(auth);
  }

  @NoTenant()
  @Post('switch-organization')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change the active organization (membership is verified)' })
  async switchOrganization(
    @CurrentAuth() auth: AuthState,
    @ZBody(switchOrganizationSchema) body: { organizationId: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const accessToken = await this.auth.switchOrganization(auth, body.organizationId);
    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: this.env.ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    return this.auth.me({ ...auth, organizationId: body.organizationId });
  }

  @Public()
  @Throttle(VERY_STRICT)
  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'Email a single-use reset link (always 202; no account enumeration)' })
  async forgotPassword(@ZBody(forgotPasswordSchema) body: ForgotPasswordInput): Promise<{ ok: true }> {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password with a reset token; signs out every session' })
  async resetPassword(@ZBody(resetPasswordSchema) body: ResetPasswordInput): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Public()
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@ZBody(verifyEmailSchema) body: { token: string }): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @NoTenant()
  @Throttle(VERY_STRICT)
  @Post('resend-verification')
  @HttpCode(204)
  async resendVerification(@CurrentAuth() auth: AuthState): Promise<void> {
    await this.auth.resendVerification(auth);
  }
}
