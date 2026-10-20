import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { AssignmentService } from './assignment.service.js';
import { AttachmentsService } from './attachments.service.js';
import { TransitionsService } from './transitions.service.js';
import { WorkOrderQueryService } from './work-order-query.service.js';
import { AttachmentsController, WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

@Global()
@Module({
  controllers: [WorkOrdersController, AttachmentsController],
  providers: [WorkOrderQueryService, WorkOrdersService, TransitionsService, ActivityService, AttachmentsService, AssignmentService],
  exports: [WorkOrderQueryService, WorkOrdersService, TransitionsService, AssignmentService],
})
export class WorkOrdersModule {}
