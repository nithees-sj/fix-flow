'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PRIORITY_META, STATUS_META, WORK_ORDER_STATUSES, formatMinutes, type AnalyticsReport } from '@fixflow/shared';
import { ChartFrame, SERIES } from '@/components/charts/chart-kit';
import { BarsChart, TimeSeriesChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Segmented } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { formatDate, percent } from '@/lib/format';
import { qk } from '@/lib/query-client';

const RANGES = { '30d': 30, '90d': 90, '180d': 180, '365d': 365 } as const;
type R = keyof typeof RANGES;

export default function AnalyticsPage() {
  const [range, setRange] = useState<R>('90d');
  const params = useMemo(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - RANGES[range] * 86_400_000).toISOString(), to: to.toISOString() };
  }, [range]);
  const q = useQuery({ queryKey: qk.analytics(range), queryFn: () => api<AnalyticsReport>('/analytics/report', { query: params }), placeholderData: keepPreviousData });
  const r = q.data;
  const refreshing = q.isFetching && !!r;
  const rate = (met: number, missed: number) => (met + missed ? Math.round((met / (met + missed)) * 100) : null);
  const exportUrl = (report: string) => `/api/v1/analytics/export.csv?report=${report}&from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={r ? `${formatDate(r.range.from)} – ${formatDate(r.range.to)} · grouped by ${r.granularity}` : 'Maintenance performance over time'}
        actions={
          <Segmented ariaLabel="Date range" value={range} onChange={setRange} options={[{ value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: '180d', label: '6 months' }, { value: '365d', label: '12 months' }]} />
        }
      />
      {!r ? (
        <div className="grid gap-4 xl:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartFrame
            title="Maintenance trend"
            description={`Work orders created and resolved per ${r.granularity}`}
            refreshing={refreshing}
            legend={[{ label: 'Created', color: SERIES[0], shape: 'line' }, { label: 'Resolved', color: SERIES[1], shape: 'line' }]}
            table={{ columns: ['Period', 'Created', 'Resolved'], rows: r.trend.map((t) => [t.bucket, t.created, t.resolved]) }}
          >
            <TimeSeriesChart granularity={r.granularity} variant="line" data={r.trend.map((t) => ({ bucket: t.bucket, created: t.created, resolved: t.resolved }))} series={[{ key: 'created', label: 'Created', color: SERIES[0] }, { key: 'resolved', label: 'Resolved', color: SERIES[1] }]} />
          </ChartFrame>

          <ChartFrame
            title="Resolution time"
            description="Average time from report to approved repair"
            refreshing={refreshing}
            table={{ columns: ['Period', 'Average resolution'], rows: r.trend.map((t) => [t.bucket, t.avgResolutionMinutes === null ? '—' : formatMinutes(t.avgResolutionMinutes)]) }}
          >
            <TimeSeriesChart
              granularity={r.granularity}
              variant="area"
              yFormat={(v) => `${Math.round(v / 60)}h`}
              data={r.trend.map((t) => ({ bucket: t.bucket, avg: t.avgResolutionMinutes }))}
              series={[{ key: 'avg', label: 'Avg. resolution', color: SERIES[0], format: (v) => formatMinutes(v) }]}
            />
          </ChartFrame>

          <ChartFrame
            title="SLA compliance"
            description="Share of clocks that met their target, by report date"
            refreshing={refreshing}
            legend={[{ label: 'Response', color: SERIES[0], shape: 'line' }, { label: 'Resolution', color: SERIES[1], shape: 'line' }]}
            table={{ columns: ['Period', 'Response met', 'Response missed', 'Resolution met', 'Resolution missed'], rows: r.sla.map((s) => [s.bucket, s.responseMet, s.responseMissed, s.resolutionMet, s.resolutionMissed]) }}
          >
            <TimeSeriesChart
              granularity={r.granularity}
              variant="line"
              yFormat={(v) => `${v}%`}
              data={r.sla.map((s) => ({ bucket: s.bucket, response: rate(s.responseMet, s.responseMissed), resolution: rate(s.resolutionMet, s.resolutionMissed) }))}
              series={[{ key: 'response', label: 'Response', color: SERIES[0], format: (v) => `${v}%` }, { key: 'resolution', label: 'Resolution', color: SERIES[1], format: (v) => `${v}%` }]}
            />
          </ChartFrame>

          <ChartFrame
            title="Status distribution"
            description="Work orders reported in this period, by current status"
            refreshing={refreshing}
            table={{ columns: ['Status', 'Work orders'], rows: r.statusDistribution.map((s) => [STATUS_META[s.status].label, s.count]) }}
          >
            <BarsChart categoryWidth={130} data={[...r.statusDistribution].sort((a, b) => WORK_ORDER_STATUSES.indexOf(a.status) - WORK_ORDER_STATUSES.indexOf(b.status)).map((s) => ({ label: STATUS_META[s.status].label, count: s.count }))} series={[{ key: 'count', label: 'Work orders', color: SERIES[0] }]} />
          </ChartFrame>

          <ChartFrame
            title="By category"
            description="Where maintenance effort goes"
            refreshing={refreshing}
            height={Math.max(220, r.categoryDistribution.length * 34)}
            table={{ columns: ['Category', 'Work orders'], rows: r.categoryDistribution.map((c) => [c.name, c.count]) }}
          >
            <BarsChart categoryWidth={90} data={r.categoryDistribution.map((c) => ({ label: c.name, count: c.count }))} series={[{ key: 'count', label: 'Work orders', color: SERIES[0] }]} />
          </ChartFrame>

          <Card className="min-w-0">
            <CardHeader title="SLA by priority" description="Met ÷ evaluated clocks for work reported in this period" />
            <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th scope="col" className="px-5 py-2 font-medium">Priority</th>
                  <th scope="col" className="px-3 py-2 font-medium">Work orders</th>
                  <th scope="col" className="px-3 py-2 font-medium">Response met</th>
                  <th scope="col" className="px-5 py-2 font-medium">Resolution met</th>
                </tr>
              </thead>
              <tbody>
                {r.slaByPriority.map((p) => (
                  <tr key={p.priority} className="border-t border-line-subtle">
                    <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">{PRIORITY_META[p.priority].label}</th>
                    <td className="px-3 py-2.5 tabular text-ink-2">{p.total}</td>
                    <td className="px-3 py-2.5"><Meter value={p.responseRate} /></td>
                    <td className="px-5 py-2.5"><Meter value={p.resolutionRate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          <Card className="min-w-0 xl:col-span-2">
            <CardHeader title="Technician performance" description="Completed = verified repairs in this period" />
            {r.technicians.length === 0 ? (
              <EmptyState compact icon={<FileSpreadsheet />} title="No technicians yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-xs text-ink-3">
                      {['Technician', 'Completed', 'Open now', 'Avg. resolution', 'SLA met', 'Rework rate'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-5 py-2 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {r.technicians.map((t) => (
                      <tr key={t.userId} className="border-t border-line-subtle">
                        <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">{t.name}</th>
                        <td className="px-5 py-2.5 tabular">{t.completed}</td>
                        <td className="px-5 py-2.5 tabular">{t.open}</td>
                        <td className="px-5 py-2.5 tabular">{t.avgResolutionMinutes === null ? '—' : formatMinutes(t.avgResolutionMinutes)}</td>
                        <td className="px-5 py-2.5"><Meter value={t.slaMetRate} /></td>
                        <td className="px-5 py-2.5 tabular text-ink-2">{percent(t.reworkRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="min-w-0">
            <CardHeader title="Most frequent failures" description="Assets with the most corrective requests" />
            {r.assetFailures.length === 0 ? (
              <EmptyState compact icon={<FileSpreadsheet />} title="No asset failures in this period" />
            ) : (
              <ol className="divide-y divide-line-subtle px-2 pb-2">
                {r.assetFailures.map((a, i) => (
                  <li key={a.assetId}>
                    <Link href={`/assets/${a.assetId}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-sunken">
                      <span className="w-5 text-xs text-ink-4 tabular">{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink">{a.name}</span><span className="block truncate text-xs text-ink-3"><span className="font-mono">{a.assetTag}</span> · {a.location}</span></span>
                      <span className="text-sm font-semibold tabular text-ink">{a.failures}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card id="export" className="min-w-0">
            <CardHeader title="Download reports" description="CSV for the selected period — opens in Excel, Sheets or Numbers" />
            <div className="grid gap-2 px-5 pb-5">
              <Button asChild variant="secondary" className="justify-start"><a href={exportUrl('work-orders')} download><Download /> Work orders with SLA outcomes</a></Button>
              <Button asChild variant="secondary" className="justify-start"><a href={exportUrl('technicians')} download><Download /> Technician performance</a></Button>
              <p className="text-xs text-ink-3">Exports are recorded in the audit log.</p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

/** Proportion meter with the number as text (never color alone). */
function Meter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-4">—</span>;
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-blue-100" aria-hidden>
        <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-ink-2">{pct}%</span>
    </span>
  );
}
