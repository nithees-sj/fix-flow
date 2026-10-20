import { Injectable } from '@nestjs/common';
import type { Prisma, Tx } from '@fixflow/db';

export interface AuditEntry {
  action: string; // e.g. "workOrder.assigned"
  entityType: string; // e.g. "WorkOrder"
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditActor {
  organizationId: string;
  userId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Append-only audit trail, written in the same transaction as the change it describes. */
@Injectable()
export class AuditService {
  async record(tx: Tx, actor: AuditActor, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
      },
      select: { id: true },
    });
  }
}
