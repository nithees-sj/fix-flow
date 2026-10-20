'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowRight, CheckCircle2, ClipboardList, Gauge, Hourglass, Inbox, ShieldCheck, Timer, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatMinutes, formatWorkOrderNumber, PRIORITY_META, type DashboardSummary, type Paginated, type WorkOrderSummary } from '@fixflow/shared';
import { ChartFrame, SERIES } from '@/components/charts/chart-kit';
import { BarsChart, TimeSeriesChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Segmented } from '@/components/ui/menu';
import { StatTile } from '@/components/ui/stat-tile';
import { PriorityBadge, SlaIndicator, StatusBadge } from '@/components/work-orders/badges';
import { api } from '@/lib/api';
import { percent, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';

const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const;
type RangeKey = keyof typeof RANGES;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { user, org } = useActor();
  const [range, setRange] = useState<RangeKey>('30d');
  const params = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[range] * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [range]);

  const dash = useQuery({
    queryKey: qk.dashboard(range),
    queryFn: () => api<DashboardSummary>('/dashboard', { query: params }),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });
  const overdue = useQuery({
    queryKey: qk.workOrders({ overdue: true, dash: true }),
    queryFn: () => api<Paginated<WorkOrderSummary>>('/work-orders', { query: { overdue: 'true', pageSize: 6, sort: 'resolutionDueAt', order: 'asc' } }),
  });

  const d = dash.data;
  const loading = !d;
  const firstName = user?.name.replace(/^(Dr\.|Prof\.)\s*/, '').split(' ')[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName ?? ''}`}
        description={`Here’s how maintenance is running across ${org?.name ?? 'your organization'}.`}
        actions={
          <>
            <Segmented
              ariaLabel="Date range"
              value={range}
              onChange={setRange}
              options={[
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
                { value: '90d', label: '90 days' },
              ]}
            />
            <Button asChild variant="secondary" size="sm">
              <Link href="/analytics">Full analytics</Link>
            </Button>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile loading={loading} label="Open backlog" icon={<Inbox />} value={d ? (d.totals.open + d.totals.inProgress + d.totals.pendingVerification).toLocaleString() : ''} hint={d && `${d.totals.open} unassigned · ${d.totals.inProgress} in progress`} />
        <StatTile loading={loading} label="Overdue" icon={<AlarmClock />} tone={d?.totals.overdue ? 'danger' : 'success'} value={d?.totals.overdue.toLocaleString()} hint="Past a response or resolution target" />
        <StatTile loading={loading} label="Avg. response time" icon={<Timer />} value={d ? formatMinutes(d.avgResponseMinutes ?? NaN) : ''} hint="Report → technician on the job" />
        <StatTile loading={loading} label="SLA compliance" icon={<ShieldCheck />} tone={d && (d.slaCompliance.overall ?? 1) < 0.8 ? 'warning' : 'success'} value={d ? percent(d.slaCompliance.overall) : ''} hint={d && `Response ${percent(d.slaCompliance.response)} · Resolution ${percent(d.slaCompliance.resolution)}`} />
        <StatTile loading={loading} label={`Created (${range})`} icon={<ClipboardList />} value={d?.totals.total.toLocaleString()} hint="New work orders in range" />
        <StatTile loading={loading} label={`Resolved (${range})`} icon={<CheckCircle2 />} tone="success" value={d?.totals.resolved.toLocaleString()} hint="Verified repairs in range" />
        <StatTile loading={loading} label="Avg. resolution time" icon={<Gauge />} value={d ? formatMinutes(d.avgResolutionMinutes ?? NaN) : ''} hint="Report → approved repair" />
        <StatTile loading={loading} label="Awaiting verification" icon={<Hourglass />} tone={d?.totals.pendingVerification ? 'warning' : 'default'} value={d?.totals.pendingVerification.toLocaleString()} hint="Submitted, pending review" />
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <ChartFrame
          className="xl:col-span-2"
          title="Ticket volume"
          description="Work orders created and resolved per day"
          refreshing={dash.isFetching && !!d}
          legend={[
            { label: 'Created', color: SERIES[0], shape: 'line' },
            { label: 'Resolved', color: SERIES[1], shape: 'line' },
          ]}
          table={{ columns: ['Date', 'Created', 'Resolved'], rows: (d?.volume ?? []).map((v) => [v.date, v.created, v.resolved]) }}
        >
          {d ? (
            <TimeSeriesChart
              data={d.volume.map((v) => ({ bucket: v.date, created: v.created, resolved: v.resolved }))}
              series={[
                { key: 'created', label: 'Created', color: SERIES[0] },
                { key: 'resolved', label: 'Resolved', color: SERIES[1] },
              ]}
            />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </ChartFrame>

        <ChartFrame
          title="Open work by priority"
          description="Active work orders right now"
          refreshing={dash.isFetching && !!d}
          table={{ columns: ['Priority', 'Open now', `Created (${range})`], rows: (d?.byPriority ?? []).map((p) => [PRIORITY_META[p.priority].label, p.open, p.total]) }}
        >
          {d ? (
            <BarsChart
              data={d.byPriority.map((p) => ({ label: PRIORITY_META[p.priority].label, open: p.open }))}
              series={[{ key: 'open', label: 'Open now', color: SERIES[0] }]}
              categoryWidth={70}
            />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </ChartFrame>

        <ChartFrame
          title="Technician workload"
          description="Current assignments per technician"
          refreshing={dash.isFetching && !!d}
          height={Math.max(280, (d?.technicianWorkload.length ?? 5) * 40)}
          legend={[
            { label: 'Assigned', color: SERIES[0] },
            { label: 'In progress', color: SERIES[1] },
            { label: 'On hold', color: SERIES[2] },
          ]}
          table={{
            columns: ['Technician', 'Assigned', 'In progress', 'On hold', `Completed (${range})`],
            rows: (d?.technicianWorkload ?? []).map((t) => [t.name, t.assigned, t.inProgress, t.onHold, t.completed]),
          }}
        >
          {d ? (
            d.technicianWorkload.length ? (
              <BarsChart
                stacked
                data={d.technicianWorkload.map((t) => ({ label: t.name, assigned: t.assigned, inProgress: t.inProgress, onHold: t.onHold }))}
                series={[
                  { key: 'assigned', label: 'Assigned', color: SERIES[0] },
                  { key: 'inProgress', label: 'In progress', color: SERIES[1] },
                  { key: 'onHold', label: 'On hold', color: SERIES[2] },
                ]}
              />
            ) : (
              <EmptyState compact icon={<Wrench />} title="No technicians yet" description="Invite technicians to start assigning work." />
            )
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </ChartFrame>

        <Card className="flex min-w-0 flex-col">
          <CardHeader
            title="Needs attention"
            description="Overdue work, most urgent first"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/work-orders?overdue=true">
                  View all <ArrowRight />
                </Link>
              </Button>
            }
          />
          <ul className="flex-1 divide-y divide-line-subtle px-2 pb-2">
            {overdue.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-3 py-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </li>
              ))}
            {overdue.data?.data.length === 0 && (
              <li>
                <EmptyState compact icon={<ShieldCheck />} title="Nothing overdue" description="Every active work order is within its SLA." />
              </li>
            )}
            {overdue.data?.data.map((w) => (
              <li key={w.id}>
                <Link href={`/work-orders/${w.number}`} className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-sunken">
                  <PriorityBadge priority={w.priority} compact />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      <span className="font-mono text-xs font-normal text-ink-3">{formatWorkOrderNumber(w.number)}</span> {w.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                      <StatusBadge status={w.status} />
                      <SlaIndicator clock={w.response.completedAt ? w.resolution : w.response} label={w.response.completedAt ? 'Resolution' : 'Response'} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex min-w-0 flex-col">
          <CardHeader title="Recent activity" description="Latest status changes" />
          <ol className="flex-1 px-5 pb-4">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex gap-3 py-2.5">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </li>
              ))}
            {d?.recentActivity.length === 0 && <EmptyState compact icon={<ClipboardList />} title="No activity yet" />}
            {d?.recentActivity.slice(0, 7).map((a, i, arr) => (
              <li key={a.id} className="relative flex gap-3 pb-3.5">
                {i < arr.length - 1 && <span className="absolute left-3 top-7 h-[calc(100%-1.5rem)] w-px bg-line" aria-hidden />}
                {a.actor ? <Avatar name={a.actor.name} size="sm" /> : <span className="grid size-6 place-items-center rounded-full bg-surface-muted text-[10px] text-ink-3">FF</span>}
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
                  <span className="font-medium text-ink">{a.actor?.name ?? 'FixFlow'}</span>{' '}
                  {a.workOrderNumber ? (
                    <Link href={`/work-orders/${a.workOrderNumber}`} className="hover:text-brand-ink hover:underline">
                      {a.summary}
                    </Link>
                  ) : (
                    a.summary
                  )}
                  <span className="mt-0.5 block text-xs text-ink-4">{timeAgo(a.at)}</span>
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
