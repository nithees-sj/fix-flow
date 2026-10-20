import { Controller, Get, HttpCode, Inject, Patch, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createOrganizationSchema,
  updateOrganizationPolicySchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type MeResponse,
  type OrganizationDto,
  type OrganizationPolicy,
  type UpdateOrganizationInput,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { Actor, AuthState } from '../../common/auth/actor.js';
import { ACCESS_COOKIE } from '../../common/auth/cookies.js';
import { ClientInfo, CurrentActor, CurrentAuth, NoTenant, RequirePermissions } from '../../common/auth/decorators.js';
import { ZBody } from '../../common/zod.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionService } from '../auth/session.service.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @NoTenant()
  @Post()
  @ApiOperation({ summary: 'Create an organization; the caller becomes its admin and it becomes active' })
  async create(
    @CurrentAuth() auth: AuthState,
    @ZBody(createOrganizationSchema) body: CreateOrganizationInput,
    @ClientInfo() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ organization: OrganizationDto; me: MeResponse }> {
    const organization = await this.orgs.create(auth.userId, body, client);
    await this.sessions.setActiveOrganization(auth.sessionId, organization.id);
    const token = await this.auth.reissueAccessToken(auth.userId, auth.sessionId, organization.id);
    res.cookie(ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: this.env.ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    const me = await this.auth.me({ ...auth, organizationId: organization.id });
    return { organization, me };
  }

  @Get('current')
  current(@CurrentActor() actor: Actor): Promise<OrganizationDto> {
    return this.orgs.current(actor);
  }

  @Patch('current')
  @RequirePermissions('org.settings')
  update(@CurrentActor() actor: Actor, @ZBody(updateOrganizationSchema) body: UpdateOrganizationInput): Promise<OrganizationDto> {
    return this.orgs.update(actor, body);
  }

  @Patch('current/policy')
  @RequirePermissions('org.settings')
  @ApiOperation({ summary: 'Workflow and permission policy toggles' })
  updatePolicy(
    @CurrentActor() actor: Actor,
    @ZBody(updateOrganizationPolicySchema) body: Partial<OrganizationPolicy>,
  ): Promise<OrganizationDto> {
    return this.orgs.updatePolicy(actor, body);
  }

  @Post('current/onboarding/complete')
  @HttpCode(200)
  @RequirePermissions('org.settings')
  completeOnboarding(@CurrentActor() actor: Actor): Promise<OrganizationDto> {
    return this.orgs.completeOnboarding(actor);
  }
}
