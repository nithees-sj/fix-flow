import type { WorkOrderStatus } from './enums.js';

/**
 * Socket.IO contract. Payloads are deliberately minimal "invalidation hints":
 * clients refetch through authorized REST endpoints, so a socket event can never
 * leak data the user could not otherwise read.
 */
export interface ServerToClientEvents {
  'workOrder.created': (p: { id: string; number: number }) => void;
  'workOrder.updated': (p: { id: string; number: number; version: number; status: WorkOrderStatus }) => void;
  'workOrder.commented': (p: { workOrderId: string }) => void;
  'notification.created': (p: { id: string; unreadCount: number }) => void;
  'dashboard.invalidate': () => void;
  'session.expired': () => void;
}

export interface ClientToServerEvents {
  'workOrder.watch': (p: { id: string }, ack: (r: { ok: boolean }) => void) => void;
  'workOrder.unwatch': (p: { id: string }) => void;
}

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  orgStaff: (orgId: string) => `org:${orgId}:staff`,
  orgManagers: (orgId: string) => `org:${orgId}:managers`,
  workOrder: (orgId: string, workOrderId: string) => `org:${orgId}:wo:${workOrderId}`,
} as const;

export const REALTIME_PATH = '/realtime';
