import { Inject, Injectable } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import { rooms, type ServerToClientEvents, type WorkOrderStatus } from '@fixflow/shared';
import { REDIS } from './tokens.js';

/**
 * Publishes realtime hints through Redis so every API instance (and the worker) can
 * reach every connected client. Payloads carry ids only; clients refetch over REST.
 */
@Injectable()
export class RealtimePublisher {
  private readonly emitter: Emitter<ServerToClientEvents>;

  constructor(@Inject(REDIS) redis: Redis) {
    this.emitter = new Emitter<ServerToClientEvents>(redis.duplicate());
  }

  /** Work order changed: staff of the org, the watchers of the work order, requester & assignee. */
  workOrderChanged(p: {
    organizationId: string;
    id: string;
    number: number;
    version: number;
    status: WorkOrderStatus;
    requesterId: string | null;
    assigneeId: string | null;
    created?: boolean;
  }): void {
    const targets = [
      rooms.orgManagers(p.organizationId),
      rooms.workOrder(p.organizationId, p.id),
      ...(p.requesterId ? [rooms.user(p.requesterId)] : []),
      ...(p.assigneeId ? [rooms.user(p.assigneeId)] : []),
    ];
    const to = this.emitter.to(targets);
    if (p.created) to.emit('workOrder.created', { id: p.id, number: p.number });
    to.emit('workOrder.updated', { id: p.id, number: p.number, version: p.version, status: p.status });
    this.emitter.to(rooms.orgManagers(p.organizationId)).emit('dashboard.invalidate');
  }

  commented(organizationId: string, workOrderId: string): void {
    this.emitter.to(rooms.workOrder(organizationId, workOrderId)).emit('workOrder.commented', { workOrderId });
  }

  notify(userId: string, notificationId: string, unreadCount: number): void {
    this.emitter.to(rooms.user(userId)).emit('notification.created', { id: notificationId, unreadCount });
  }

  sessionExpired(userId: string): void {
    this.emitter.to(rooms.user(userId)).emit('session.expired');
  }
}
