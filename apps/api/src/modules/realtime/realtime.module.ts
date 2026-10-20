import { Module } from '@nestjs/common';
import { RealtimeGateway, RealtimeTicketController } from './realtime.gateway.js';

@Module({
  controllers: [RealtimeTicketController],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
