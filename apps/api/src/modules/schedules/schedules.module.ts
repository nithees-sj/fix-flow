import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller.js';

@Module({ controllers: [SchedulesController] })
export class SchedulesModule {}
