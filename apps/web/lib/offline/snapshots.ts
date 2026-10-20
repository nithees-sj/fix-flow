'use client';

import { isApiError } from '../api';
import { offlineDb } from './store';

/** Snapshots expire so stale private data does not linger on the device. */
const MAX_AGE_MS = 7 * 86_400_000;
let currentScope: string | null = null;

export function setSnapshotScope(userId: string, organizationId: string): void {
  currentScope = `${userId}:${organizationId}`;
}

export async function saveSnapshot(key: string, data: unknown): Promise<void> {
  if (!currentScope || typeof indexedDB === 'undefined') return;
  try {
    const db = await offlineDb();
    await db.put('snapshots', { key: `${currentScope}:${key}`, scope: currentScope, savedAt: Date.now(), data });
  } catch {
    /* storage unavailable (private mode) — offline view simply won't be available */
  }
}

export async function loadSnapshot<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  if (!currentScope || typeof indexedDB === 'undefined') return null;
  try {
    const db = await offlineDb();
    const row = await db.get('snapshots', `${currentScope}:${key}`);
    if (!row || Date.now() - row.savedAt > MAX_AGE_MS) return null;
    return { data: row.data as T, savedAt: row.savedAt };
  } catch {
    return null;
  }
}

/**
 * Network-first query function with an offline fallback: successful responses are snapshotted;
 * when the network is unreachable the last snapshot is served (and marked as such).
 */
export function offlineFirst<T>(key: string, fetcher: () => Promise<T>): () => Promise<T & { __offline?: number }> {
  return async () => {
    try {
      const data = await fetcher();
      void saveSnapshot(key, data);
      return data as T & { __offline?: number };
    } catch (e) {
      if (isApiError(e) && e.status === 0) {
        const snap = await loadSnapshot<T>(key);
        if (snap) return Object.assign(snap.data as object, { __offline: snap.savedAt }) as T & { __offline?: number };
      }
      throw e;
    }
  };
}
