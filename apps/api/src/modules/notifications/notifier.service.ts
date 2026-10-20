import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Tx } from '@fixflow/db';
import type { NotificationType, Role } from '@fixflow/shared';
import { OutboxService } from '../../infra/outbox.service.js';

export interface NotificationSpec {
  type: NotificationType;
  title: string;
  body: string;
  workOrderId?: string | null;
  /** Stable per logical event; combined with the user id it makes creation idempotent. */
  dedupeKey: string;
}

export interface CreatedNotification {
  id: string;
  userId: string;
}

/**
 * Creates notifications inside the caller's business transaction (so they can never be lost
 * or duplicated relative to the change) and records an outbox event for email delivery.
 * Respects per-user preferences: in-app rows only when `inApp`, email only when `email`.
 */
@Injectable()
export class NotifierService {
  constructor(private readonly outbox: OutboxService) {}

  async notify(
    tx: Tx,
    organizationId: string,
    recipientIds: Iterable<string | null | undefined>,
    spec: NotificationSpec,
    opts: { excludeUserId?: string | null } = {},
  ): Promise<CreatedNotification[]> {
    const recipients = [...new Set([...recipientIds].filter((x): x is string => !!x && x !== opts.excludeUserId))];
    if (!recipients.length) return [];

    const prefs = await tx.notificationPreference.findMany({
      where: { organizationId, userId: { in: recipients }, type: spec.type },
      select: { userId: true, inApp: true, email: true },
    });
    const prefOf = (userId: string) => prefs.find((p) => p.userId === userId) ?? { inApp: true, email: true };

    const inApp = recipients.filter((u) => prefOf(u).inApp).map((userId) => ({ id: randomUUID(), userId }));
    if (inApp.length) {
      // createMany (no RETURNING): recipients' rows are not readable by the actor under RLS.
      await tx.notification.createMany({
        data: inApp.map((n) => ({
          id: n.id,
          organizationId,
          userId: n.userId,
          type: spec.type,
          title: spec.title.slice(0, 200),
          body: spec.body.slice(0, 1000),
          workOrderId: spec.workOrderId ?? null,
          dedupeKey: spec.dedupeKey,
        })),
        skipDuplicates: true,
      });
    }

    const emailTo = recipients.filter((u) => prefOf(u).email);
    if (emailTo.length) {
      await this.outbox.add(tx, organizationId, 'notifications.email', {
        deliveries: emailTo.map((userId) => ({
          userId,
          title: spec.title,
          body: spec.body,
          workOrderId: spec.workOrderId ?? null,
        })),
      });
    }
    return inApp;
  }

  /** Active managers and admins of the organization (triage, escalations, reviews). */
  async managers(tx: Tx, organizationId: string, roles: Role[] = ['MANAGER', 'ORG_ADMIN']): Promise<string[]> {
    const rows = await tx.membership.findMany({
      where: { organizationId, status: 'ACTIVE', role: { in: roles } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
