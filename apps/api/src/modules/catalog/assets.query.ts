import { Injectable } from '@nestjs/common';
import type { Prisma, Tx } from '@fixflow/db';
import { ACTIVE_STATUSES, type AssetSummary, type CategoryColor, type CategoryIcon } from '@fixflow/shared';
import { LocationIndex } from '../locations/location-index.js';

export const assetInclude = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

@Injectable()
export class AssetsQuery {
  async summaries(
    tx: Tx,
    organizationId: string,
    where: Prisma.AssetWhereInput,
    locations?: LocationIndex,
    take?: number,
    skip?: number,
    orderBy: Prisma.AssetOrderByWithRelationInput | Prisma.AssetOrderByWithRelationInput[] = { name: 'asc' },
  ): Promise<AssetSummary[]> {
    const rows = await tx.asset.findMany({ where: { organizationId, ...where }, include: assetInclude, orderBy, take, skip });
    return this.toSummaries(tx, organizationId, rows, locations);
  }

  async toSummaries(tx: Tx, organizationId: string, rows: AssetRow[], locations?: LocationIndex): Promise<AssetSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [open, serviced] = await Promise.all([
      tx.workOrder.groupBy({ by: ['assetId'], where: { organizationId, assetId: { in: ids }, status: { in: [...ACTIVE_STATUSES] } }, _count: true }),
      tx.workOrder.groupBy({ by: ['assetId'], where: { organizationId, assetId: { in: ids }, resolvedAt: { not: null } }, _max: { resolvedAt: true } }),
    ]);
    const openBy = new Map(open.map((o) => [o.assetId, o._count]));
    const servicedBy = new Map(serviced.map((s) => [s.assetId, s._max.resolvedAt]));
    const idx = locations ?? (await LocationIndex.load(tx, organizationId));
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      assetTag: a.assetTag,
      status: a.status,
      category: { id: a.category.id, name: a.category.name, color: a.category.color as CategoryColor, icon: a.category.icon as CategoryIcon },
      location: { id: a.location.id, name: a.location.name, path: idx.path(a.location.id) },
      openWorkOrders: openBy.get(a.id) ?? 0,
      lastServicedAt: servicedBy.get(a.id)?.toISOString() ?? null,
    }));
  }
}
