import { Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { isUniqueViolation, type Database, type Prisma, type Tx } from '@fixflow/db';
import { createScheduleSchema, nextOccurrenceAfter, type CreateScheduleInput, type ScheduleDto, type WorkOrderDetail } from '@fixflow/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { conflict, notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody } from '../../common/zod.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { loadPolicy } from '../work-orders/policy.js';
import { WorkOrderQueryService } from '../work-orders/work-order-query.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

const include = {
  category: { select: { id: true, name: true } },
  asset: { select: { id: true, name: true, assetTag: true, locationId: true } },
  location: { select: { id: true, name: true } },
  checklistTemplate: { select: { id: true, name: true } },
  defaultAssignee: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.MaintenanceScheduleInclude;

const updateSchema = z.object({ active: z.boolean() }).or(z.object({ title: z.string().trim().min(3).max(140) }));

@ApiTags('maintenance')
@Controller('schedules')
export class SchedulesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly workOrders: WorkOrdersService,
    private readonly query: WorkOrderQueryService,
  ) {}

  private async dtos(tx: Tx, orgId: string, id?: string): Promise<ScheduleDto[]> {
    const [rows, idx] = await Promise.all([
      tx.maintenanceSchedule.findMany({ where: { organizationId: orgId, ...(id ? { id } : {}) }, include, orderBy: [{ active: 'desc' }, { nextDueAt: 'asc' }] }),
      LocationIndex.load(tx, orgId),
    ]);
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      category: s.category,
      priority: s.priority,
      asset: s.asset ? { id: s.asset.id, name: s.asset.name, assetTag: s.asset.assetTag } : null,
      location: s.location ? { id: s.location.id, name: s.location.name, path: idx.path(s.location.id) } : s.asset ? { id: s.asset.locationId, name: idx.get(s.asset.locationId)?.name ?? '', path: idx.path(s.asset.locationId) } : null,
      checklistTemplate: s.checklistTemplate,
      defaultAssignee: s.defaultAssignee?.user ?? null,
      frequencyUnit: s.frequencyUnit,
      frequencyInterval: s.frequencyInterval,
      startsAt: s.startsAt.toISOString(),
      nextDueAt: s.nextDueAt.toISOString(),
      leadTimeDays: s.leadTimeDays,
      lastGeneratedAt: s.lastGeneratedAt?.toISOString() ?? null,
      active: s.active,
    }));
  }

  @Get()
  @RequirePermissions('schedule.read')
  list(@CurrentActor() actor: Actor): Promise<ScheduleDto[]> {
    return this.db.tx(actor.ctx, (tx) => this.dtos(tx, actor.organizationId));
  }

  @Post()
  @RequirePermissions('schedule.manage')
  create(@CurrentActor() actor: Actor, @ZBody(createScheduleSchema) body: CreateScheduleInput): Promise<ScheduleDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const org = actor.organizationId;
      const checks: Promise<number>[] = [tx.category.count({ where: { id: body.categoryId, organizationId: org } })];
      if (body.assetId) checks.push(tx.asset.count({ where: { id: body.assetId, organizationId: org, archivedAt: null } }));
      if (body.locationId) checks.push(tx.location.count({ where: { id: body.locationId, organizationId: org, archivedAt: null } }));
      if (body.checklistTemplateId) checks.push(tx.checklistTemplate.count({ where: { id: body.checklistTemplateId, organizationId: org } }));
      if (body.defaultAssigneeId) checks.push(tx.membership.count({ where: { organizationId: org, userId: body.defaultAssigneeId, role: 'TECHNICIAN', status: 'ACTIVE' } }));
      if ((await Promise.all(checks)).some((n) => n === 0)) throw notFound('Referenced record');
      const policy = await loadPolicy(tx, org);
      const startsAt = new Date(body.startsAt);
      const nextDueAt = nextOccurrenceAfter(startsAt, body.frequencyUnit, body.frequencyInterval, new Date(Date.now() - 1), policy.timezone);
      const s = await tx.maintenanceSchedule.create({
        data: {
          organizationId: org,
          title: body.title,
          description: body.description,
          categoryId: body.categoryId,
          priority: body.priority,
          assetId: body.assetId ?? null,
          locationId: body.assetId ? null : (body.locationId ?? null),
          checklistTemplateId: body.checklistTemplateId ?? null,
          defaultAssigneeId: body.defaultAssigneeId ?? null,
          frequencyUnit: body.frequencyUnit,
          frequencyInterval: body.frequencyInterval,
          startsAt,
          nextDueAt,
          leadTimeDays: body.leadTimeDays,
          active: body.active,
        },
        select: { id: true },
      });
      await this.audit.record(tx, actor, { action: 'schedule.created', entityType: 'MaintenanceSchedule', entityId: s.id, metadata: { title: body.title } });
      return (await this.dtos(tx, org, s.id))[0]!;
    });
  }

  @Patch(':id')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Pause/resume or rename a schedule' })
  update(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @ZBody(updateSchema) body: z.output<typeof updateSchema>): Promise<ScheduleDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const res = await tx.maintenanceSchedule.updateMany({ where: { id, organizationId: actor.organizationId }, data: body });
      if (!res.count) throw notFound('Schedule');
      await this.audit.record(tx, actor, { action: 'schedule.updated', entityType: 'MaintenanceSchedule', entityId: id, metadata: body });
      return (await this.dtos(tx, actor.organizationId, id))[0]!;
    });
  }

  @Post(':id/run-now')
  @HttpCode(201)
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Generate a preventive work order immediately' })
  async runNow(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<WorkOrderDetail> {
    try {
      const { detail, notifications } = await this.db.tx(actor.ctx, async (tx) => {
        const sc = await tx.maintenanceSchedule.findFirst({ where: { id, organizationId: actor.organizationId } });
        if (!sc) throw notFound('Schedule');
        const now = new Date();
        now.setMilliseconds(0);
        const made = await this.workOrders.createInTx(
          tx,
          { organizationId: actor.organizationId, userId: null, ip: actor.ip, userAgent: actor.userAgent },
          { title: sc.title, description: sc.description ?? '', priority: sc.priority, categoryId: sc.categoryId, assetId: sc.assetId, locationId: sc.locationId, checklistTemplateId: sc.checklistTemplateId },
          { source: 'SCHEDULED', schedule: { id: sc.id, scheduledFor: now } },
        );
        await tx.maintenanceSchedule.update({ where: { id }, data: { lastGeneratedAt: now } });
        await this.audit.record(tx, actor, { action: 'schedule.runNow', entityType: 'MaintenanceSchedule', entityId: id, metadata: { workOrderId: made.id } });
        return { detail: await this.query.detail(tx, actor, made.id), notifications: made.notifications };
      });
      this.workOrders.afterCommit(actor.organizationId, detail, notifications, true);
      return detail;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('This schedule just generated a work order — try again in a moment.');
      throw e;
    }
  }
}
