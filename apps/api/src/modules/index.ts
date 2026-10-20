import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { HealthModule } from './health/health.module.js';
import { MembersModule } from './members/members.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PublicReportModule } from './public-report/public-report.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { SearchModule } from './search/search.module.js';
import { WorkOrdersModule } from './work-orders/work-orders.module.js';

/** Every HTTP feature module, registered by AppModule. */
export const FEATURE_MODULES = [
  HealthModule,
  AuthModule,
  NotificationsModule,
  OrganizationsModule,
  WorkOrdersModule,
  CatalogModule,
  MembersModule,
  AnalyticsModule,
  SearchModule,
  SchedulesModule,
  AuditModule,
  PublicReportModule,
  RealtimeModule,
];
