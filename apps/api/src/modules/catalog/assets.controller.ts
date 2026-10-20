import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { isUniqueViolation, type Database, type Prisma, type Tx } from '@fixflow/db';
import {
  assetListQuerySchema,
  createAssetSchema,
  updateAssetSchema,
  type AssetDetail,
  type AssetListQuery,
  type AssetSummary,
  type CreateAssetInput,
  type Paginated,
  type UpdateAssetInput,
  type WorkOrderSummary,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { conflict, notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody, ZQuery } from '../../common/zod.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { newReportToken } from '../organizations/organizations.service.js';
import { WorkOrderQueryService } from '../work-orders/work-order-query.service.js';
import { assetInclude, AssetsQuery } from './assets.query.js';
import { reportUrl, sendQr } from './qr.js';

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly query: AssetsQuery,
    private readonly workOrders: WorkOrderQueryService,
  ) {}

  @Get()
  @RequirePermissions('asset.read')
  list(@CurrentActor() actor: Actor, @ZQuery(assetListQuerySchema) q: AssetListQuery): Promise<Paginated<AssetSummary>> {
    return this.db.tx(actor.ctx, async (tx) => {
      const idx = await LocationIndex.load(tx, actor.organizationId);
      const where: Prisma.AssetWhereInput = {
        archivedAt: null,
        ...(q.status?.length ? { status: { in: q.status } } : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.locationId ? { locationId: { in: idx.subtree(q.locationId) } } : {}),
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' } },
                { assetTag: { contains: q.q, mode: 'insensitive' } },
                { serialNumber: { contains: q.q, mode: 'insensitive' } },
                { model: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const orderBy: Prisma.AssetOrderByWithRelationInput =
        q.sort === 'openWorkOrders' ? { workOrders: { _count: q.order } } : { [q.sort]: q.order };
      const [data, total] = await Promise.all([
        this.query.summaries(tx, actor.organizationId, where, idx, q.pageSize, (q.page - 1) * q.pageSize, [orderBy, { name: 'asc' }]),
        tx.asset.count({ where: { organizationId: actor.organizationId, ...where } }),
      ]);
      return { data, meta: { page: q.page, pageSize: q.pageSize, total, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) } };
    });
  }

  private async detail(tx: Tx, actor: Actor, id: string): Promise<AssetDetail & { reportUrl: string | null }> {
    const a = await tx.asset.findFirst({ where: { id, organizationId: actor.organizationId }, include: assetInclude });
    if (!a) throw notFound('Asset');
    const [summary] = await this.query.toSummaries(tx, actor.organizationId, [a]);
    const since = new Date(Date.now() - 90 * 86_400_000);
    const [total, corrective, resolved] = await Promise.all([
      tx.workOrder.count({ where: { organizationId: actor.organizationId, assetId: id } }),
      tx.workOrder.count({ where: { organizationId: actor.organizationId, assetId: id, source: { not: 'SCHEDULED' }, createdAt: { gte: since } } }),
      tx.workOrder.findMany({
        where: { organizationId: actor.organizationId, assetId: id, resolutionSubmittedAt: { not: null }, resolvedAt: { not: null } },
        select: { cycleStartedAt: true, resolutionSubmittedAt: true },
      }),
    ]);
    const mins = resolved.map((w) => (w.resolutionSubmittedAt!.getTime() - w.cycleStartedAt.getTime()) / 60_000);
    return {
      ...summary!,
      manufacturer: a.manufacturer,
      model: a.model,
      serialNumber: a.serialNumber,
      installDate: a.installDate?.toISOString() ?? null,
      warrantyExpiresAt: a.warrantyExpiresAt?.toISOString() ?? null,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      stats: {
        totalWorkOrders: total,
        correctiveLast90d: corrective,
        avgResolutionMinutes: mins.length ? Math.round(mins.reduce((x, y) => x + y, 0) / mins.length) : null,
      },
      reportUrl: actor.permissions.has('asset.manage') ? reportUrl(this.env.APP_WEB_URL, a.publicReportToken) : null,
    };
  }

  @Get(':id')
  @RequirePermissions('asset.read')
  get(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string) {
    return this.db.tx(actor.ctx, (tx) => this.detail(tx, actor, id));
  }

  @Get(':id/work-orders')
  @RequirePermissions('workOrder.readAll')
  @ApiOperation({ summary: 'Maintenance history of the asset' })
  history(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<WorkOrderSummary[]> {
    return this.db.tx(actor.ctx, async (tx) => {
      const exists = await tx.asset.count({ where: { id, organizationId: actor.organizationId } });
      if (!exists) throw notFound('Asset');
      return this.workOrders.listSummaries(tx, actor.organizationId, { where: { assetId: id }, take: 100 });
    });
  }

  @Post()
  @RequirePermissions('asset.manage')
  async create(@CurrentActor() actor: Actor, @ZBody(createAssetSchema) body: CreateAssetInput) {
    try {
      return await this.db.tx(actor.ctx, async (tx) => {
        await this.assertRefs(tx, actor.organizationId, body.locationId, body.categoryId);
        const a = await tx.asset.create({
          data: {
            organizationId: actor.organizationId,
            name: body.name,
            assetTag: body.assetTag,
            categoryId: body.categoryId,
            locationId: body.locationId,
            status: body.status,
            manufacturer: body.manufacturer,
            model: body.model,
            serialNumber: body.serialNumber,
            installDate: toDate(body.installDate),
            warrantyExpiresAt: toDate(body.warrantyExpiresAt),
            notes: body.notes,
            publicReportToken: newReportToken(),
          },
          select: { id: true },
        });
        await this.audit.record(tx, actor, { action: 'asset.created', entityType: 'Asset', entityId: a.id, metadata: { name: body.name, assetTag: body.assetTag } });
        return this.detail(tx, actor, a.id);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('An asset with this tag already exists');
      throw e;
    }
  }

  @Patch(':id')
  @RequirePermissions('asset.manage')
  async update(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @ZBody(updateAssetSchema) body: UpdateAssetInput) {
    try {
      return await this.db.tx(actor.ctx, async (tx) => {
        const existing = await tx.asset.findFirst({ where: { id, organizationId: actor.organizationId } });
        if (!existing) throw notFound('Asset');
        await this.assertRefs(tx, actor.organizationId, body.locationId, body.categoryId);
        const { installDate, warrantyExpiresAt, ...rest } = body;
        await tx.asset.update({
          where: { id },
          data: { ...rest, installDate: toDate(installDate), warrantyExpiresAt: toDate(warrantyExpiresAt) },
        });
        await this.audit.record(tx, actor, { action: 'asset.updated', entityType: 'Asset', entityId: id, metadata: { changes: body } });
        return this.detail(tx, actor, id);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('An asset with this tag already exists');
      throw e;
    }
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('asset.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string) {
    return this.db.tx(actor.ctx, async (tx) => {
      const res = await tx.asset.updateMany({ where: { id, organizationId: actor.organizationId }, data: { archivedAt: new Date(), status: 'RETIRED' } });
      if (!res.count) throw notFound('Asset');
      await this.audit.record(tx, actor, { action: 'asset.archived', entityType: 'Asset', entityId: id });
      return this.detail(tx, actor, id);
    });
  }

  @Get(':id/qr')
  @RequirePermissions('asset.manage')
  async qr(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string, @Query('format') format: string | undefined, @Res() res: Response): Promise<void> {
    const a = await this.db.tx(actor.ctx, (tx) => tx.asset.findFirst({ where: { id, organizationId: actor.organizationId }, select: { publicReportToken: true, assetTag: true } }));
    if (!a) throw notFound('Asset');
    await sendQr(res, reportUrl(this.env.APP_WEB_URL, a.publicReportToken), format, `qr-${a.assetTag}`);
  }

  @Post(':id/qr/rotate')
  @HttpCode(200)
  @RequirePermissions('asset.manage')
  rotate(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<{ reportUrl: string }> {
    return this.db.tx(actor.ctx, async (tx) => {
      const token = newReportToken();
      const res = await tx.asset.updateMany({ where: { id, organizationId: actor.organizationId }, data: { publicReportToken: token } });
      if (!res.count) throw notFound('Asset');
      await this.audit.record(tx, actor, { action: 'asset.qrRotated', entityType: 'Asset', entityId: id });
      return { reportUrl: reportUrl(this.env.APP_WEB_URL, token) };
    });
  }

  private async assertRefs(tx: Tx, orgId: string, locationId?: string, categoryId?: string): Promise<void> {
    if (locationId && !(await tx.location.count({ where: { id: locationId, organizationId: orgId, archivedAt: null } }))) throw notFound('Location');
    if (categoryId && !(await tx.category.count({ where: { id: categoryId, organizationId: orgId } }))) throw notFound('Category');
  }
}
