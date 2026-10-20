'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, ChevronRight, CloudOff, HardHat, MapPin, Play, RefreshCw, Trash2, TriangleAlert, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { formatWorkOrderNumber, PRIORITY_META, type Paginated, type WorkOrderDetail, type WorkOrderSummary } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Segmented } from '@/components/ui/menu';
import { StatTile } from '@/components/ui/stat-tile';
import { CategoryChip, PriorityBadge, SlaIndicator, StatusBadge } from '@/components/work-orders/badges';
import { useTransition } from '@/components/work-orders/detail/use-work-order';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, shortPath, timeAgo } from '@/lib/format';
import { discardOutboxItem, retryOutboxItem, syncOutbox, useOutbox } from '@/lib/offline/outbox';
import { offlineFirst, saveSnapshot } from '@/lib/offline/snapshots';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';
import { cn } from '@/lib/utils';

type Tab = 'queue' | 'today' | 'history';
const ACTIVE = 'ASSIGNED,IN_PROGRESS,ON_HOLD,PENDING_VERIFICATION';

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

export default function MyWorkPage() {
  const qc = useQueryClient();
  const { user, org } = useActor();
  const [tab, setTab] = useState<Tab>('queue');

  const active = useQuery({
    queryKey: qk.workOrders({ mine: 'active' }),
    queryFn: offlineFirst('my-work:active', () =>
      api<Paginated<WorkOrderSummary>>('/work-orders', { query: { assigneeId: 'me', status: ACTIVE, pageSize: 100, sort: 'priority', order: 'desc' } }),
    ),
    refetchInterval: 60_000,
  });
  const history = useQuery({
    queryKey: qk.workOrders({ mine: 'history' }),
    queryFn: offlineFirst('my-work:history', () =>
      api<Paginated<WorkOrderSummary>>('/work-orders', { query: { assigneeId: 'me', status: 'RESOLVED,CLOSED', pageSize: 30, sort: 'updatedAt', order: 'desc' } }),
    ),
    enabled: tab === 'history',
  });

  // Keep every active job's full detail on the device so it stays viewable offline.
  useEffect(() => {
    const jobs = active.data?.data;
    if (!jobs || active.data && '__offline' in active.data) return;
    jobs.slice(0, 20).forEach((j) => {
      void qc
        .fetchQuery({ queryKey: qk.workOrderByNumber(j.number), queryFn: () => api<WorkOrderDetail>(`/work-orders/number/${j.number}`), staleTime: 60_000 })
        .then((d) => saveSnapshot(`won:${j.number}`, d))
        .catch(() => undefined);
    });
  }, [active.data, qc]);

  const jobs = useMemo(() => {
    const all = active.data?.data ?? [];
    // Priority first, then the nearest deadline.
    return [...all].sort(
      (a, b) =>
        PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
        new Date(a.resolution.dueAt).getTime() - new Date(b.resolution.dueAt).getTime(),
    );
  }, [active.data]);
  const today = jobs.filter((j) => isToday(j.resolution.dueAt) || isToday(j.response.dueAt) || j.status === 'IN_PROGRESS' || j.isOverdue);
  const overdue = jobs.filter((j) => j.isOverdue).length;
  const offlineSince = active.data && '__offline' in active.data ? (active.data as { __offline?: number }).__offline : undefined;

  const shown = tab === 'queue' ? jobs : tab === 'today' ? today : (history.data?.data ?? []);
  const loading = tab === 'history' ? history.isLoading : active.isLoading;

  return (
    <>
      <PageHeader
        title="My work"
        description={new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        actions={<AvailabilityToggle initial={org?.isAvailable ?? true} />}
      />

      {offlineSince && (
        <Alert tone="warning" className="mb-4" title="Showing your jobs saved on this device">
          You’re offline. Last synced {timeAgo(new Date(offlineSince).toISOString())}. Updates you make are queued and sync automatically.
        </Alert>
      )}

      <PendingChanges />

      <section aria-label="Summary" className="mb-5 grid grid-cols-3 gap-3">
        <StatTile loading={active.isLoading} label="Active jobs" icon={<Wrench />} value={jobs.length} />
        <StatTile loading={active.isLoading} label="Today" icon={<HardHat />} value={today.length} />
        <StatTile loading={active.isLoading} label="Overdue" icon={<AlarmClock />} tone={overdue ? 'danger' : 'success'} value={overdue} />
      </section>

      <div className="mb-3 flex items-center justify-between">
        <Segmented
          ariaLabel="View"
          size="md"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'queue', label: `Queue · ${jobs.length}` },
            { value: 'today', label: `Today · ${today.length}` },
            { value: 'history', label: 'History' },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: ['work-orders'] })} aria-label="Refresh">
          <RefreshCw className={cn(active.isFetching && 'animate-spin')} />
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === 'history' ? <CheckCircle2 /> : <HardHat />}
            title={tab === 'history' ? 'No completed jobs yet' : 'You’re all clear'}
            description={tab === 'history' ? 'Jobs you complete will appear here.' : 'New assignments appear here instantly — you’ll also get a notification.'}
          />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((j) => (
            <li key={j.id}>
              <JobCard job={j} history={tab === 'history'} />
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">{user ? `${jobs.length} active jobs` : ''}</p>
    </>
  );
}

function JobCard({ job, history }: { job: WorkOrderSummary; history: boolean }) {
  const detail = useQuery({ queryKey: qk.workOrderByNumber(job.number), queryFn: () => api<WorkOrderDetail>(`/work-orders/number/${job.number}`), enabled: false });
  const t = useTransition(detail.data ?? ({ ...job, availableActions: [] } as unknown as WorkOrderDetail));
  const canQuickStart = job.status === 'ASSIGNED' && !!detail.data;
  return (
    <Card className={cn('relative transition-shadow hover:shadow-md', job.isOverdue && !history && 'border-red-200')}>
      <Link href={`/work-orders/${job.number}`} className="block p-4 focus-visible:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink-3">{formatWorkOrderNumber(job.number)}</p>
            <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{job.title}</h3>
          </div>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
          <span>{job.asset ? `${job.asset.name} · ` : ''}{shortPath(job.location?.path) || 'No location'}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <PriorityBadge priority={job.priority} />
          <CategoryChip category={job.category} />
          {!history && <SlaIndicator clock={job.response.completedAt ? job.resolution : job.response} label={job.response.completedAt ? 'Resolution' : 'Response'} />}
          {history && <span className="text-xs text-ink-3">Updated {formatDateTime(job.updatedAt)}</span>}
        </div>
      </Link>
      {!history && (
        <div className="flex items-center justify-between gap-2 border-t border-line-subtle px-4 py-2.5">
          <span className="text-xs text-ink-3">{job.requester ? `From ${job.requester.name}` : job.guestName ? `Guest: ${job.guestName}` : 'Preventive maintenance'}</span>
          {canQuickStart ? (
            <Button size="sm" loading={t.isPending} onClick={() => t.mutate({ action: 'start' }, { onSuccess: () => toast.success('Work started') })}>
              <Play /> Start
            </Button>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/work-orders/${job.number}`}>
                Open <ChevronRight />
              </Link>
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function AvailabilityToggle({ initial }: { initial: boolean }) {
  const qc = useQueryClient();
  const [on, setOn] = useState(initial);
  const m = useMutation({
    mutationFn: (isAvailable: boolean) => api<{ isAvailable: boolean }>('/members/me/availability', { method: 'PUT', body: { isAvailable } }),
    onSuccess: (r) => {
      toast.success(r.isAvailable ? 'You’re available for new assignments' : 'You won’t receive automatic assignments');
      void qc.invalidateQueries({ queryKey: qk.me });
    },
    onError: (e) => {
      setOn((v) => !v);
      toast.error(errorMessage(e));
    },
  });
  return (
    <label className="inline-flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 shadow-xs">
      <Switch checked={on} onCheckedChange={(v) => { setOn(v); m.mutate(v); }} aria-label="Available for assignments" />
      {on ? 'Available' : 'Unavailable'}
    </label>
  );
}

/** Offline queue with explicit conflict handling — nothing is overwritten silently. */
function PendingChanges() {
  const items = useOutbox();
  const qc = useQueryClient();
  if (!items.length) return null;
  const conflicts = items.filter((i) => i.status === 'conflict');
  return (
    <Card id="pending" className="mb-5">
      <CardHeader
        title="Pending changes"
        description={conflicts.length ? 'Some changes conflict with newer updates on the server' : 'Saved on this device — they sync automatically'}
        action={
          <Button size="xs" variant="secondary" onClick={() => void syncOutbox().then(() => qc.invalidateQueries({ queryKey: ['work-orders'] }))}>
            <RefreshCw /> Sync now
          </Button>
        }
      />
      <ul className="divide-y divide-line-subtle px-5 pb-3">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
            {i.status === 'conflict' ? <TriangleAlert className="size-4 text-warning-ink" /> : <CloudOff className="size-4 text-ink-4" />}
            <span className="min-w-0 flex-1 text-[13px]">
              <span className="font-medium text-ink">{i.label}</span>
              <span className="block text-xs text-ink-3">
                {i.status === 'conflict' ? i.error : i.status === 'failed' ? `Failed: ${i.error}` : `Queued ${timeAgo(new Date(i.createdAt).toISOString())}`}
              </span>
            </span>
            {i.status === 'conflict' && (
              <span className="flex gap-1.5">
                <Button size="xs" variant="secondary" asChild>
                  <Link href={`/work-orders/${i.workOrderId}`}>Review</Link>
                </Button>
                {i.kind === 'transition' && (
                  <Button
                    size="xs"
                    onClick={async () => {
                      const latest = await api<WorkOrderDetail>(`/work-orders/${i.workOrderId}`);
                      await retryOutboxItem(i.id, { expectedVersion: latest.version });
                      void syncOutbox();
                    }}
                  >
                    Apply to latest
                  </Button>
                )}
              </span>
            )}
            {(i.status === 'conflict' || i.status === 'failed') && (
              <Button size="icon-xs" variant="danger-ghost" aria-label="Discard change" onClick={() => void discardOutboxItem(i.id)}>
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
