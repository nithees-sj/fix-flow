'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TransitionInput, WorkOrderDetail } from '@fixflow/shared';
import { api, errorMessage, isApiError } from '@/lib/api';
import { offlineFirst } from '@/lib/offline/snapshots';
import { qk } from '@/lib/query-client';
import { ACTION_DEFINITIONS } from '@fixflow/shared';
import { queueOrRun } from '@/lib/offline/outbox';

const STATUS_ACTION_LABEL: Record<string, string> = Object.fromEntries(Object.entries(ACTION_DEFINITIONS).map(([k, v]) => [k, v.label]));

export function useWorkOrder(ref: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(ref);
  const n = Number(ref.replace(/^wo-?/i, ''));
  return useQuery({
    queryKey: isUuid ? qk.workOrder(ref) : qk.workOrderByNumber(n),
    // Jobs stay viewable offline: last successful response is snapshotted on the device.
    queryFn: offlineFirst(isUuid ? `wo:${ref}` : `won:${n}`, () => api<WorkOrderDetail>(isUuid ? `/work-orders/${ref}` : `/work-orders/number/${n}`)),
    enabled: isUuid || Number.isFinite(n),
  });
}

/** Writes a fresh detail into every cache entry that refers to this work order. */
export function useCacheWorkOrder() {
  const qc = useQueryClient();
  return (wo: WorkOrderDetail) => {
    qc.setQueryData(qk.workOrder(wo.id), wo);
    qc.setQueryData(qk.workOrderByNumber(wo.number), wo);
    void qc.invalidateQueries({ queryKey: ['work-orders', 'list'] });
    void qc.invalidateQueries({ queryKey: qk.timeline(wo.id) });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

type TransitionBody = TransitionInput extends infer T ? (T extends { expectedVersion: number } ? Omit<T, 'expectedVersion'> : never) : never;

/** Lifecycle actions with optimistic-concurrency handling and an idempotency key per attempt. */
export function useTransition(wo: WorkOrderDetail | undefined) {
  const cache = useCacheWorkOrder();
  const qc = useQueryClient();
  return useMutation({
    // Online: runs immediately (idempotent). Offline: queued with expectedVersion for later sync.
    mutationFn: (body: TransitionBody) =>
      queueOrRun<WorkOrderDetail>({
        workOrderId: wo!.id,
        kind: 'transition',
        label: STATUS_ACTION_LABEL[body.action] ?? body.action,
        path: `/work-orders/${wo!.id}/transitions`,
        method: 'POST',
        body: { ...body, expectedVersion: wo!.version },
      }),
    onSuccess: (data) => {
      if (data) cache(data);
      else toast.info('Saved offline', { description: 'This change will sync automatically when you reconnect.' });
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'VERSION_CONFLICT') {
        toast.warning('This work order changed while you were viewing it', { description: 'We loaded the latest version — please review and try again.' });
        if (wo) {
          void qc.invalidateQueries({ queryKey: qk.workOrder(wo.id) });
          void qc.invalidateQueries({ queryKey: qk.workOrderByNumber(wo.number) });
        }
        return;
      }
      toast.error(errorMessage(e));
    },
  });
}
