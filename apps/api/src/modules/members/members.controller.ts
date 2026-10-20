import { Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  memberListQuerySchema,
  setSkillsSchema,
  updateMemberSchema,
  type MemberDto,
  type MemberListQuery,
  type MemberProfileDto,
  type Paginated,
  type SetSkillsInput,
  type UpdateMemberInput,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { UuidParamPipe, ZBody, ZQuery } from '../../common/zod.js';
import { MembersService } from './members.service.js';

const availabilitySchema = z.object({ isAvailable: z.boolean() });

@ApiTags('team')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions('team.read')
  list(@CurrentActor() actor: Actor, @ZQuery(memberListQuerySchema) q: MemberListQuery): Promise<Paginated<MemberDto>> {
    return this.members.list(actor, q);
  }

  /** Technicians toggle their own availability (excluded from auto-assignment when off). */
  @Put('me/availability')
  setAvailability(@CurrentActor() actor: Actor, @ZBody(availabilitySchema) body: { isAvailable: boolean }) {
    return this.members.setOwnAvailability(actor, body.isAvailable);
  }

  @Get(':id')
  @RequirePermissions('team.read')
  get(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<MemberProfileDto> {
    return this.members.get(actor, id);
  }

  /** Role/status changes need team.manage (admins); job title/availability need team.manageSkills. */
  @Patch(':id')
  @RequirePermissions('team.read')
  update(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @ZBody(updateMemberSchema) body: UpdateMemberInput): Promise<MemberDto> {
    return this.members.update(actor, id, body);
  }

  @Put(':id/skills')
  @RequirePermissions('team.manageSkills')
  setSkills(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @ZBody(setSkillsSchema) body: SetSkillsInput): Promise<MemberDto> {
    return this.members.setSkills(actor, id, body);
  }
}
