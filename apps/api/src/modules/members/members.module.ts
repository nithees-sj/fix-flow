import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { ProfileController } from './profile.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [MembersController, InvitationsController, ProfileController],
  providers: [MembersService, InvitationsService],
})
export class MembersModule {}
