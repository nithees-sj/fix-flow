import { Module } from '@nestjs/common';
import { loggerModule } from '../app.module.js';
import { InfraModule } from '../infra/infra.module.js';
import { NotificationsModule } from '../modules/notifications/notifications.module.js';
import { WorkOrdersModule } from '../modules/work-orders/work-orders.module.js';
import { AutomationService } from './automation.service.js';
import { EmailProcessor } from './email.processor.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { SlaEngine } from './sla.engine.js';
import { WorkerRuntime } from './worker.runtime.js';

/** Worker process: same domain modules as the API (no HTTP), plus queue processors. */
@Module({
  imports: [loggerModule, InfraModule, NotificationsModule, WorkOrdersModule],
  providers: [OutboxDispatcher, EmailProcessor, SlaEngine, AutomationService, WorkerRuntime],
  exports: [WorkerRuntime, OutboxDispatcher, SlaEngine, AutomationService, EmailProcessor],
})
export class WorkerModule {}
