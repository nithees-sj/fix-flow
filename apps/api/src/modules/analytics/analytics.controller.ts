import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { stringify } from 'csv-stringify';
import type { Response } from 'express';
import { z } from 'zod';
import type { Database } from '@fixflow/db';
import {
  PRIORITY_META,
  STATUS_META,
  analyticsQuerySchema,
  formatWorkOrderNumber,
  isoDateTime,
  type AnalyticsQuery,
  type AnalyticsReport,
  type DashboardSummary,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { ZQuery } from '../../common/zod.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { AnalyticsService } from './analytics.service.js';

const dashboardQuery = z.object({ from: isoDateTime.optional(), to: isoDateTime.optional() });
const exportQuery = z.object({ from: isoDateTime, to: isoDateTime, report: z.enum(['work-orders', 'technicians']).default('work-orders') });

@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Role-aware operational dashboard (defaults to the last 30 days)' })
  dashboard(@CurrentActor() actor: Actor, @ZQuery(dashboardQuery) q: z.output<typeof dashboardQuery>): Promise<DashboardSummary> {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
    return this.analytics.dashboard(actor, from, to);
  }

  @Get('analytics/report')
  @RequirePermissions('analytics.read')
  report(@CurrentActor() actor: Actor, @ZQuery(analyticsQuerySchema) q: AnalyticsQuery): Promise<AnalyticsReport> {
    return this.analytics.report(actor, new Date(q.from), new Date(q.to));
  }

  @Get('analytics/export.csv')
  @RequirePermissions('report.export')
  @ApiOperation({ summary: 'Download a CSV report for the date range (tenant-scoped, audited)' })
  async export(@CurrentActor() actor: Actor, @ZQuery(exportQuery) q: z.output<typeof exportQuery>, @Res() res: Response): Promise<void> {
    const from = new Date(q.from);
    const to = new Date(q.to);
    const fileName = `fixflow-${q.report}-${q.from.slice(0, 10)}-to-${q.to.slice(0, 10)}.csv`;
    let rows: (string | number)[][];
    let header: string[];

    if (q.report === 'technicians') {
      const r = await this.analytics.report(actor, from, to);
      header = ['Technician', 'Completed', 'Open now', 'Avg resolution (min)', 'SLA met %', 'Rework %'];
      rows = r.technicians.map((t) => [
        t.name,
        t.completed,
        t.open,
        t.avgResolutionMinutes ?? '',
        t.slaMetRate === null ? '' : Math.round(t.slaMetRate * 100),
        t.reworkRate === null ? '' : Math.round(t.reworkRate * 100),
      ]);
    } else {
      header = ['Number', 'Title', 'Status', 'Priority', 'Category', 'Location', 'Asset', 'Requester', 'Assignee', 'Created', 'Responded', 'Resolved', 'Response SLA', 'Resolution SLA', 'Rework count'];
      rows = await this.db.tx(actor.ctx, async (tx) => {
        const idx = await LocationIndex.load(tx, actor.organizationId);
        const wos = await tx.workOrder.findMany({
          where: { organizationId: actor.organizationId, createdAt: { gte: from, lte: to } },
          orderBy: { number: 'asc' },
          take: 50_000,
          include: {
            category: { select: { name: true } },
            asset: { select: { assetTag: true } },
            requester: { select: { user: { select: { name: true } } } },
            assignee: { select: { user: { select: { name: true } } } },
          },
        });
        const verdict = (done: Date | null, due: Date) => (done ? (done <= due ? 'Met' : 'Missed') : due < new Date() ? 'Missed' : 'Open');
        return wos.map((w) => [
          formatWorkOrderNumber(w.number),
          w.title,
          STATUS_META[w.status].label,
          PRIORITY_META[w.priority].label,
          w.category.name,
          idx.path(w.locationId),
          w.asset?.assetTag ?? '',
          w.requester?.user.name ?? w.guestName ?? '',
          w.assignee?.user.name ?? '',
          w.createdAt.toISOString(),
          w.respondedAt?.toISOString() ?? '',
          w.resolvedAt?.toISOString() ?? '',
          w.status === 'CANCELLED' ? '' : verdict(w.respondedAt, w.responseDueAt),
          w.status === 'CANCELLED' ? '' : verdict(w.resolvedAt ? w.resolutionSubmittedAt : null, w.resolutionDueAt),
          w.reworkCount,
        ]);
      });
    }

    await this.db.tx(actor.ctx, (tx) =>
      this.audit.record(tx, actor, { action: 'report.exported', entityType: 'Report', metadata: { report: q.report, from: q.from, to: q.to, rows: rows.length } }),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    // Leading-character neutralization prevents spreadsheet formula injection (=, +, -, @).
    const safe = rows.map((r) => r.map((v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v)));
    stringify([header, ...safe], { bom: true }).pipe(res);
  }
}
