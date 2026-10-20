'use client';

import { useEffect, useState } from 'react';
import { api, isApiError, uploadFile } from '../api';
import { newIdempotencyKey } from '../utils';
import { offlineDb, type OutboxItem } from './store';

/**
 * Offline outbox for field work.
 *
 * Sync model (documented in docs/ARCHITECTURE.md § Offline):
 *  - Every queued mutation carries a client-generated Idempotency-Key; replays reuse it, so a
 *    request that reached the server before the connection dropped is never applied twice.
 *  - Lifecycle transitions carry `expectedVersion`; if the server moved on, the API answers
 *    409 and the item becomes a visible CONFLICT for the technician — never silently overwritten.
 *  - Items replay in creation order; a work order's queue stops at its first conflict.
 *  - Retries are capped (MAX_ATTEMPTS); the server state is always authoritative.
 */
const MAX_ATTEMPTS = 5;
let scope: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setOutboxScope(userId: string, organizationId: string): void {
  scope = `${userId}:${organizationId}`;
  emit();
}

type NewItem = Pick<OutboxItem, 'workOrderId' | 'kind' | 'label' | 'path' | 'method'> & { body?: unknown; blob?: Blob; fileName?: string };

/** Runs the mutation now when possible; queues it locally when the network is unavailable. */
export async function queueOrRun<T>(item: NewItem): Promise<T | null> {
  const id = newIdempotencyKey();
  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (online) {
    try {
      return await send<T>(item, id);
    } catch (e) {
      if (!(isApiError(e) && e.status === 0)) throw e; // real server error → surface it
    }
  }
  if (!scope) throw new Error('Offline queue unavailable');
  const db = await offlineDb();
  await db.put('outbox', { ...item, id, scope, createdAt: Date.now(), attempts: 0, status: 'pending' });
  emit();
  return null;
}

async function send<T>(item: NewItem | OutboxItem, idempotencyKey: string): Promise<T> {
  if (item.kind === 'upload' && item.blob) {
    return uploadFile<T>(item.path, item.blob, item.fileName ?? 'photo.jpg', undefined, idempotencyKey);
  }
  return api<T>(item.path, { method: item.method, body: item.body, idempotencyKey });
}

export async function listOutbox(): Promise<OutboxItem[]> {
  if (!scope || typeof indexedDB === 'undefined') return [];
  const db = await offlineDb();
  const items = await db.getAllFromIndex('outbox', 'byScope', scope);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

let syncing: Promise<{ synced: number; conflicts: number }> | null = null;

/** Replays pending items. Safe to call repeatedly (single-flight). */
export function syncOutbox(onSynced?: (item: OutboxItem) => void): Promise<{ synced: number; conflicts: number }> {
  syncing ??= (async () => {
    let synced = 0;
    let conflicts = 0;
    const db = await offlineDb();
    const blocked = new Set<string>();
    for (const item of await listOutbox()) {
      if (item.status === 'conflict' || blocked.has(item.workOrderId)) {
        blocked.add(item.workOrderId);
        continue;
      }
      if (item.attempts >= MAX_ATTEMPTS) continue;
      await db.put('outbox', { ...item, status: 'syncing' });
      emit();
      try {
        await send(item, item.id);
        await db.delete('outbox', item.id);
        synced++;
        onSynced?.(item);
      } catch (e) {
        if (isApiError(e) && e.status === 0) {
          await db.put('outbox', { ...item, status: 'pending' });
          break; // still offline — try again later
        }
        const conflict = isApiError(e) && (e.code === 'VERSION_CONFLICT' || e.code === 'WORKFLOW_DENIED' || e.status === 409);
        await db.put('outbox', {
          ...item,
          attempts: item.attempts + 1,
          status: conflict ? 'conflict' : 'failed',
          error: isApiError(e) ? e.message : 'Sync failed',
        });
        if (conflict) {
          conflicts++;
          blocked.add(item.workOrderId);
        }
      }
      emit();
    }
    return { synced, conflicts };
  })().finally(() => {
    syncing = null;
    emit();
  });
  return syncing;
}

export async function discardOutboxItem(id: string): Promise<void> {
  const db = await offlineDb();
  await db.delete('outbox', id);
  emit();
}

/** Re-queues a conflicting transition against the latest server version. */
export async function retryOutboxItem(id: string, patch?: { expectedVersion?: number }): Promise<void> {
  const db = await offlineDb();
  const item = await db.get('outbox', id);
  if (!item) return;
  const body = patch?.expectedVersion && item.body && typeof item.body === 'object' ? { ...(item.body as object), expectedVersion: patch.expectedVersion } : item.body;
  await db.put('outbox', { ...item, body, id: newIdempotencyKey(), attempts: 0, status: 'pending', error: undefined });
  await db.delete('outbox', id);
  emit();
}

/** Live view of the queue for banners and the "pending changes" panel. */
export function useOutbox(): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => void listOutbox().then((i) => alive && setItems(i)).catch(() => undefined);
    listeners.add(refresh);
    refresh();
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  return items;
}
