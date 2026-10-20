import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Database } from '@fixflow/db';
import { parseWorkOrderNumber, searchQuerySchema, type SearchResults } from '@fixflow/shared';
import type { z } from 'zod';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor } from '../../common/auth/decorators.js';
import { ZQuery } from '../../common/zod.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { workOrderVisibility } from '../work-orders/access.js';
import { loadPolicy } from '../work-orders/policy.js';
import { inSequence } from '../../common/sequential.js';

/** Command-palette search. Each result type honours the same visibility rules as its list endpoint. */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  @ApiOperation({ summary: 'Search work orders, assets, locations and people (tenant- and role-scoped)' })
  search(@CurrentActor() actor: Actor, @ZQuery(searchQuerySchema) query: z.output<typeof searchQuerySchema>): Promise<SearchResults> {
    const q = query.q;
    const number = parseWorkOrderNumber(q);
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const org = actor.organizationId;
      const [workOrders, assets, locations, people] = await inSequence(
        () => tx.workOrder.findMany({
          where: {
            organizationId: org,
            AND: [workOrderVisibility(actor, policy), { OR: [{ title: { contains: q, mode: 'insensitive' } }, ...(number ? [{ number }] : [])] }],
          },
          select: { id: true, number: true, title: true, status: true },
          orderBy: { updatedAt: 'desc' },
          take: 6,
        }),
        () => actor.permissions.has('asset.read')
          ? tx.asset.findMany({
              where: { organizationId: org, archivedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { assetTag: { contains: q, mode: 'insensitive' } }] },
              select: { id: true, name: true, assetTag: true },
              take: 5,
            })
          : [],
        () => actor.permissions.has('location.read')
          ? tx.location.findMany({
              where: { organizationId: org, archivedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
              select: { id: true },
              take: 5,
            })
          : [],
        () => actor.permissions.has('team.read')
          ? tx.membership.findMany({
              where: { organizationId: org, user: { name: { contains: q, mode: 'insensitive' } } },
              select: { userId: true, role: true, user: { select: { name: true } } },
              take: 5,
            })
          : [],
      );
      const idx = locations.length ? await LocationIndex.load(tx, org) : null;
      return {
        workOrders,
        assets,
        locations: locations.map((l) => ({ id: l.id, name: idx!.get(l.id)?.name ?? '', path: idx!.path(l.id) })),
        people: people.map((p) => ({ userId: p.userId, name: p.user.name, role: p.role })),
      };
    });
  }
}
