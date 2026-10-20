import { Controller, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Database } from '@fixflow/db';
import {
  NOTIFICATION_TYPES,
  notificationListQuerySchema,
  notificationPreferencesSchema,
  type CursorPage,
  type NotificationDto,
  type NotificationPreferencesInput,
  type NotificationType,
} from '@fixflow/shared';
import type { z } from 'zod';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody, ZQuery } from '../../common/zod.js';
import { DATABASE } from '../../infra/tokens.js';

const encodeCursor = (d: Date, id: string) => Buffer.from(`${d.toISOString()}|${id}`).toString('base64url');
const decodeCursor = (c: string): { at: Date; id: string } | null => {
  const [iso, id] = Buffer.from(c, 'base64url').toString().split('|');
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id ? { at, id } : null;
};

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  @ApiOperation({ summary: 'Notification center (newest first, cursor-paginated)' })
  async list(
    @CurrentActor() actor: Actor,
    @ZQuery(notificationListQuerySchema) q: z.output<typeof notificationListQuerySchema>,
  ): Promise<CursorPage<NotificationDto> & { unreadCount: number }> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    return this.db.tx(actor.ctx, async (tx) => {
      const where = {
        organizationId: actor.organizationId,
        userId: actor.userId,
        ...(q.unreadOnly ? { readAt: null } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
      };
      const [rows, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: q.limit + 1,
          include: { workOrder: { select: { number: true } } },
        }),
        tx.notification.count({ where: { organizationId: actor.organizationId, userId: actor.userId, readAt: null } }),
      ]);
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        data: page.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          workOrderId: n.workOrderId,
          workOrderNumber: n.workOrder?.number ?? null,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
        nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null,
        unreadCount,
      };
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentActor() actor: Actor): Promise<{ unreadCount: number }> {
    const unreadCount = await this.db.tx(actor.ctx, (tx) =>
      tx.notification.count({ where: { organizationId: actor.organizationId, userId: actor.userId, readAt: null } }),
    );
    return { unreadCount };
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<void> {
    const res = await this.db.tx(actor.ctx, (tx) =>
      tx.notification.updateMany({ where: { id, userId: actor.userId, readAt: null }, data: { readAt: new Date() } }),
    );
    if (res.count === 0) {
      const exists = await this.db.tx(actor.ctx, (tx) => tx.notification.count({ where: { id, userId: actor.userId } }));
      if (!exists) throw notFound('Notification');
    }
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentActor() actor: Actor): Promise<void> {
    await this.db.tx(actor.ctx, (tx) =>
      tx.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } }),
    );
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Per-type in-app / email preferences for the current organization' })
  async preferences(@CurrentActor() actor: Actor): Promise<{ type: NotificationType; inApp: boolean; email: boolean }[]> {
    const rows = await this.db.tx(actor.ctx, (tx) => tx.notificationPreference.findMany({ where: { userId: actor.userId } }));
    return NOTIFICATION_TYPES.map((type) => {
      const r = rows.find((p) => p.type === type);
      return { type, inApp: r?.inApp ?? true, email: r?.email ?? true };
    });
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentActor() actor: Actor,
    @ZBody(notificationPreferencesSchema) body: NotificationPreferencesInput,
  ): Promise<{ type: NotificationType; inApp: boolean; email: boolean }[]> {
    await this.db.tx(actor.ctx, async (tx) => {
      for (const p of body.preferences) {
        await tx.notificationPreference.upsert({
          where: { organizationId_userId_type: { organizationId: actor.organizationId, userId: actor.userId, type: p.type } },
          create: { organizationId: actor.organizationId, userId: actor.userId, type: p.type, inApp: p.inApp, email: p.email },
          update: { inApp: p.inApp, email: p.email },
        });
      }
    });
    return this.preferences(actor);
  }
}
