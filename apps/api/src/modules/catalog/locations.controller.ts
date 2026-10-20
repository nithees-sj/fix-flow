import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Database, Tx } from '@fixflow/db';
import {
  ACTIVE_STATUSES,
  LOCATION_PARENT_RULES,
  createLocationSchema,
  updateLocationSchema,
  type CreateLocationInput,
  type LocationDto,
  type LocationType,
  type UpdateLocationInput,
  type WorkOrderSummary,
  type AssetSummary,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody } from '../../common/zod.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { newReportToken } from '../organizations/organizations.service.js';
import { WorkOrderQueryService } from '../work-orders/work-order-query.service.js';
import { AssetsQuery } from './assets.query.js';
import { reportUrl, sendQr } from './qr.js';
import { inSequence } from '../../common/sequential.js';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly workOrders: WorkOrderQueryService,
    private readonly assets: AssetsQuery,
  ) {}

  private async dtos(tx: Tx, orgId: string, opts: { includeArchived?: boolean; ids?: string[] } = {}): Promise<LocationDto[]> {
    const idx = await LocationIndex.load(tx, orgId);
    const [assetCounts, openCounts] = await inSequence(
      () => tx.asset.groupBy({ by: ['locationId'], where: { organizationId: orgId, archivedAt: null }, _count: true }),
      () => tx.workOrder.groupBy({ by: ['locationId'], where: { organizationId: orgId, status: { in: [...ACTIVE_STATUSES] } }, _count: true }),
    );
    const assetsBy = new Map(assetCounts.map((a) => [a.locationId, a._count]));
    const openBy = new Map(openCounts.map((a) => [a.locationId, a._count]));
    const rows = await tx.location.findMany({
      where: { organizationId: orgId, ...(opts.includeArchived ? {} : { archivedAt: null }), ...(opts.ids ? { id: { in: opts.ids } } : {}) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      code: l.code,
      description: l.description,
      parentId: l.parentId,
      path: idx.path(l.id),
      assetCount: assetsBy.get(l.id) ?? 0,
      openWorkOrders: openBy.get(l.id) ?? 0,
      archived: !!l.archivedAt,
    }));
  }

  @Get()
  @RequirePermissions('location.read')
  @ApiOperation({ summary: 'All locations (flat, with breadcrumb paths) — the client builds the tree' })
  list(@CurrentActor() actor: Actor, @Query('includeArchived') includeArchived?: string): Promise<LocationDto[]> {
    return this.db.tx(actor.ctx, (tx) => this.dtos(tx, actor.organizationId, { includeArchived: includeArchived === 'true' }));
  }

  @Get(':id')
  @RequirePermissions('location.read')
  get(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<LocationDto & { children: LocationDto[]; assets: AssetSummary[]; recentWorkOrders: WorkOrderSummary[]; reportUrl: string | null }> {
    return this.db.tx(actor.ctx, async (tx) => {
      const [loc] = await this.dtos(tx, actor.organizationId, { includeArchived: true, ids: [id] });
      if (!loc) throw notFound('Location');
      const childIds = (await tx.location.findMany({ where: { organizationId: actor.organizationId, parentId: id, archivedAt: null }, select: { id: true } })).map((c) => c.id);
      const idx = await LocationIndex.load(tx, actor.organizationId);
      const subtree = idx.subtree(id);
      const isStaff = actor.role !== 'REQUESTER';
      const row = await tx.location.findUniqueOrThrow({ where: { id }, select: { publicReportToken: true } });
      return {
        ...loc,
        children: childIds.length ? await this.dtos(tx, actor.organizationId, { ids: childIds }) : [],
        assets: await this.assets.summaries(tx, actor.organizationId, { locationId: { in: subtree }, archivedAt: null }, idx, 50),
        recentWorkOrders: isStaff && actor.permissions.has('workOrder.readAll')
          ? await this.workOrders.listSummaries(tx, actor.organizationId, { where: { OR: [{ locationId: { in: subtree } }, { asset: { locationId: { in: subtree } } }] }, take: 10 }, idx)
          : [],
        reportUrl: actor.permissions.has('location.manage') ? reportUrl(this.env.APP_WEB_URL, row.publicReportToken) : null,
      };
    });
  }

  @Post()
  @RequirePermissions('location.manage')
  create(@CurrentActor() actor: Actor, @ZBody(createLocationSchema) body: CreateLocationInput): Promise<LocationDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      await this.assertParent(tx, actor.organizationId, body.type, body.parentId, null);
      const l = await tx.location.create({
        data: {
          organizationId: actor.organizationId,
          type: body.type,
          name: body.name,
          parentId: body.parentId,
          code: body.code,
          description: body.description,
          publicReportToken: newReportToken(),
        },
        select: { id: true },
      });
      await this.audit.record(tx, actor, { action: 'location.created', entityType: 'Location', entityId: l.id, metadata: { name: body.name, type: body.type } });
      return (await this.dtos(tx, actor.organizationId, { ids: [l.id] }))[0]!;
    });
  }

  @Patch(':id')
  @RequirePermissions('location.manage')
  update(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @ZBody(updateLocationSchema) body: UpdateLocationInput): Promise<LocationDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const existing = await tx.location.findFirst({ where: { id, organizationId: actor.organizationId } });
      if (!existing) throw notFound('Location');
      if (body.parentId !== undefined && body.parentId !== existing.parentId) {
        await this.assertParent(tx, actor.organizationId, existing.type, body.parentId, id);
      }
      await tx.location.update({ where: { id }, data: body });
      await this.audit.record(tx, actor, { action: 'location.updated', entityType: 'Location', entityId: id, metadata: { changes: body } });
      return (await this.dtos(tx, actor.organizationId, { includeArchived: true, ids: [id] }))[0]!;
    });
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('location.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<LocationDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const loc = await tx.location.findFirst({ where: { id, organizationId: actor.organizationId } });
      if (!loc) throw notFound('Location');
      const [children, open] = await inSequence(
        () => tx.location.count({ where: { organizationId: actor.organizationId, parentId: id, archivedAt: null } }),
        () => tx.workOrder.count({ where: { organizationId: actor.organizationId, locationId: id, status: { in: [...ACTIVE_STATUSES] } } }),
      );
      if (children) throw conflict('Archive or move the sub-locations first.');
      if (open) throw conflict('This location still has active work orders.');
      await tx.location.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record(tx, actor, { action: 'location.archived', entityType: 'Location', entityId: id });
      return (await this.dtos(tx, actor.organizationId, { includeArchived: true, ids: [id] }))[0]!;
    });
  }

  @Get(':id/qr')
  @RequirePermissions('location.manage')
  @ApiOperation({ summary: 'QR code (SVG or ?format=png) that opens the prefilled report form' })
  async qr(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @Query('format') format: string | undefined, @Res() res: Response): Promise<void> {
    const loc = await this.db.tx(actor.ctx, (tx) => tx.location.findFirst({ where: { id, organizationId: actor.organizationId }, select: { publicReportToken: true, name: true } }));
    if (!loc) throw notFound('Location');
    await sendQr(res, reportUrl(this.env.APP_WEB_URL, loc.publicReportToken), format, `qr-${loc.name}`);
  }

  @Post(':id/qr/rotate')
  @HttpCode(200)
  @RequirePermissions('location.manage')
  @ApiOperation({ summary: 'Invalidate printed labels by issuing a new report token' })
  rotate(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<{ reportUrl: string }> {
    return this.db.tx(actor.ctx, async (tx) => {
      const token = newReportToken();
      const res = await tx.location.updateMany({ where: { id, organizationId: actor.organizationId }, data: { publicReportToken: token } });
      if (!res.count) throw notFound('Location');
      await this.audit.record(tx, actor, { action: 'location.qrRotated', entityType: 'Location', entityId: id });
      return { reportUrl: reportUrl(this.env.APP_WEB_URL, token) };
    });
  }

  /** Enforces the hierarchy rules and prevents cycles when moving a location. */
  private async assertParent(tx: Tx, orgId: string, type: LocationType, parentId: string | null, selfId: string | null): Promise<void> {
    const allowed = LOCATION_PARENT_RULES[type];
    if (!parentId) {
      if (!allowed.includes(null)) throw badRequest(`A ${type.toLowerCase()} must be inside another location.`);
      return;
    }
    const parent = await tx.location.findFirst({ where: { id: parentId, organizationId: orgId, archivedAt: null }, select: { type: true } });
    if (!parent) throw notFound('Parent location');
    if (!allowed.includes(parent.type)) throw badRequest(`A ${type.toLowerCase()} cannot be placed inside a ${parent.type.toLowerCase()}.`);
    if (selfId) {
      const idx = await LocationIndex.load(tx, orgId);
      if (parentId === selfId || idx.isDescendant(parentId, selfId)) throw badRequest('A location cannot be moved inside itself.');
    }
  }
}
