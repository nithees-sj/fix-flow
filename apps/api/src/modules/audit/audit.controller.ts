import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Database, Prisma } from '@fixflow/db';
import { auditListQuerySchema, type AuditLogDto, type CursorPage } from '@fixflow/shared';
import type { z } from 'zod';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { ZQuery } from '../../common/zod.js';
import { DATABASE } from '../../infra/tokens.js';

const enc = (d: Date, id: string) => Buffer.from(`${d.toISOString()}|${id}`).toString('base64url');
const dec = (c: string) => {
  const [iso, id] = Buffer.from(c, 'base64url').toString().split('|');
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id ? { at, id } : null;
};

/** Append-only audit trail (organization admins only), newest first with cursor pagination. */
@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Audit history with filters (entity, actor, action, date range)' })
  list(@CurrentActor() actor: Actor, @ZQuery(auditListQuerySchema) q: z.output<typeof auditListQuerySchema>): Promise<CursorPage<AuditLogDto>> {
    const cursor = q.cursor ? dec(q.cursor) : null;
    return this.db.tx(actor.ctx, async (tx) => {
      const where: Prisma.AuditLogWhereInput = {
        organizationId: actor.organizationId,
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
        ...(q.action ? { action: { startsWith: q.action } } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
      };
      const rows = await tx.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        include: { actor: { select: { id: true, name: true } } },
      });
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        data: page.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actor: r.actor,
          metadata: r.metadata as Record<string, unknown>,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: rows.length > q.limit && last ? enc(last.createdAt, last.id) : null,
      };
    });
  }
}
