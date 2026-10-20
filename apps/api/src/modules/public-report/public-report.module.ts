import { Module } from '@nestjs/common';
import { PublicReportController } from './public-report.controller.js';

@Module({ controllers: [PublicReportController] })
export class PublicReportModule {}
