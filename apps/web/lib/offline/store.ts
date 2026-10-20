import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * IndexedDB store for the technician offline mode:
 *  - `snapshots`: last-known server state of assigned jobs (scoped by user + org)
 *  - `outbox`: queued mutations awaiting sync (see ./outbox.ts)
 * Everything is wiped on sign-out so private data never outlives the session.
 */
export interface OutboxItem {
  id: string; // also used as the Idempotency-Key
  scope: string; // `${userId}:${orgId}`
  workOrderId: string;
  kind: 'transition' | 'comment' | 'checklist' | 'upload';
  label: string;
  path: string;
  method: 'POST' | 'PUT';
  body?: unknown;
  blob?: Blob;
  fileName?: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed' | 'conflict';
  error?: string;
}

interface OfflineDB extends DBSchema {
  snapshots: { key: string; value: { key: string; scope: string; savedAt: number; data: unknown } };
  outbox: { key: string; value: OutboxItem; indexes: { byScope: string } };
}

const DB_NAME = 'fixflow-offline';
let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export function offlineDb(): Promise<IDBPDatabase<OfflineDB>> {
  dbPromise ??= openDB<OfflineDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('snapshots', { keyPath: 'key' });
      const outbox = db.createObjectStore('outbox', { keyPath: 'id' });
      outbox.createIndex('byScope', 'scope');
    },
  });
  return dbPromise;
}

export async function clearOfflineStore(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await offlineDb();
    db.close();
  } catch {
    /* ignore */
  }
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
