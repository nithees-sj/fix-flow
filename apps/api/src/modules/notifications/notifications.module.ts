import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotifierService } from './notifier.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotifierService],
  exports: [NotifierService],
})
export class NotificationsModule {}
