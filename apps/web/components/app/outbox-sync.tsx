'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CloudUpload, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { setOutboxScope, syncOutbox, useOutbox } from '@/lib/offline/outbox';
import { setSnapshotScope } from '@/lib/offline/snapshots';
import { qk } from '@/lib/query-client';

/** Keeps the offline queue scoped to the signed-in user/org and syncs it whenever possible. */
export function OutboxSync({ userId, organizationId }: { userId: string; organizationId: string }) {
  const qc = useQueryClient();
  const items = useOutbox();

  useEffect(() => {
    setOutboxScope(userId, organizationId);
    setSnapshotScope(userId, organizationId);
    const run = () => {
      if (!navigator.onLine) return;
      void syncOutbox((item) => {
        void qc.invalidateQueries({ queryKey: qk.workOrder(item.workOrderId) });
        void qc.invalidateQueries({ queryKey: ['work-orders'] });
      }).then(({ synced, conflicts }) => {
        if (synced) toast.success(`Synced ${synced} offline change${synced === 1 ? '' : 's'}`);
        if (conflicts) toast.warning('Some offline changes conflict with newer updates', { description: 'Review them in My work → Pending changes.' });
      });
    };
    run();
    window.addEventListener('online', run);
    const t = setInterval(run, 30_000);
    return () => {
      window.removeEventListener('online', run);
      clearInterval(t);
    };
  }, [userId, organizationId, qc]);

  const pending = items.filter((i) => i.status === 'pending' || i.status === 'syncing' || i.status === 'failed').length;
  const conflicts = items.filter((i) => i.status === 'conflict').length;
  if (!pending && !conflicts) return null;
  return (
    <Link
      href="/my-work#pending"
      className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${conflicts ? 'bg-warning-soft text-warning-ink' : 'bg-brand-soft text-brand-ink'}`}
    >
      {conflicts ? <TriangleAlert className="size-3.5" /> : <CloudUpload className="size-3.5" />}
      {conflicts ? `${conflicts} conflict${conflicts === 1 ? '' : 's'}` : `${pending} pending`}
    </Link>
  );
}
