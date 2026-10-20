'use client';

import { useQuery } from '@tanstack/react-query';
import { Archive, Boxes, ChevronRight, ClipboardList, Gauge, Pencil, Plus, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ASSET_STATUS_META, formatMinutes, formatWorkOrderNumber, type AssetDetail, type WorkOrderSummary } from '@fixflow/shared';
import { AssetDialog } from '@/components/assets/asset-dialog';
import { QrPanel } from '@/components/qr/qr-panel';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { StatTile } from '@/components/ui/stat-tile';
import { DataTable } from '@/components/ui/table';
import { CategoryChip, PriorityBadge, StatusBadge } from '@/components/work-orders/badges';
import { api } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useActor();
  const [editing, setEditing] = useState(false);
  const asset = useQuery({ queryKey: qk.asset(id), queryFn: () => api<AssetDetail & { reportUrl: string | null }>(`/assets/${id}`) });
  const history = useQuery({ queryKey: ['assets', id, 'history'], queryFn: () => api<WorkOrderSummary[]>(`/assets/${id}/work-orders`), enabled: can('workOrder.readAll') });
  const a = asset.data;

  if (asset.isError) return <Card><EmptyState icon={<Boxes />} title="Asset not found" action={<Button asChild variant="secondary"><Link href="/assets">Back to assets</Link></Button>} /></Card>;
  if (!a) return <div className="grid gap-4"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-ink-3">
        <Link href="/assets" className="hover:text-ink">Assets</Link>
        <ChevronRight className="size-3.5" />
        <span className="font-mono text-ink-2">{a.assetTag}</span>
      </nav>
      <PageHeader
        title={a.name}
        meta={
          <>
            <Badge tone={ASSET_STATUS_META[a.status].tone} dot>{ASSET_STATUS_META[a.status].label}</Badge>
            <CategoryChip category={a.category} />
            <span className="text-[13px] text-ink-3">{a.location.path}</span>
          </>
        }
        actions={
          <>
            {can('asset.manage') && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
            <Button asChild size="sm"><Link href={`/work-orders/new?asset=${a.id}`}><Plus /> Report issue</Link></Button>
          </>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4">
          <section aria-label="Maintenance statistics" className="grid grid-cols-3 gap-3">
            <StatTile label="Work orders (all time)" icon={<ClipboardList />} value={a.stats.totalWorkOrders} />
            <StatTile label="Failures (90 days)" icon={<Wrench />} tone={a.stats.correctiveLast90d > 3 ? 'warning' : 'default'} value={a.stats.correctiveLast90d} hint="Corrective requests" />
            <StatTile label="Avg. resolution" icon={<Gauge />} value={a.stats.avgResolutionMinutes === null ? '—' : formatMinutes(a.stats.avgResolutionMinutes)} />
          </section>
          {can('workOrder.readAll') && (
            <Card className="overflow-hidden">
              <CardHeader title="Maintenance history" description={`${history.data?.length ?? 0} work orders on this asset`} />
              <DataTable
                caption="Maintenance history"
                dense
                rows={history.data}
                loading={history.isLoading}
                rowKey={(w) => w.id}
                onRowClick={(w) => router.push(`/work-orders/${w.number}`)}
                columns={[
                  { key: 'wo', header: 'Work order', cell: (w) => <span className="font-medium text-ink"><span className="mr-1.5 font-mono text-xs font-normal text-ink-3">{formatWorkOrderNumber(w.number)}</span>{w.title}</span> },
                  { key: 'status', header: 'Status', cell: (w) => <StatusBadge status={w.status} /> },
                  { key: 'priority', header: 'Priority', cell: (w) => <PriorityBadge priority={w.priority} />, hideBelow: 'md' },
                  { key: 'by', header: 'Technician', cell: (w) => <span className="text-[13px]">{w.assignee?.name ?? '—'}</span>, hideBelow: 'lg' },
                  { key: 'when', header: 'Reported', cell: (w) => <span className="text-xs text-ink-3">{timeAgo(w.createdAt)}</span>, hideBelow: 'sm' },
                ]}
                empty={<EmptyState compact icon={<ClipboardList />} title="No maintenance yet" />}
              />
            </Card>
          )}
        </div>
        <div className="grid gap-4">
          <Card>
            <CardHeader title="Specifications" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 text-[13px]">
              {[
                ['Manufacturer', a.manufacturer],
                ['Model', a.model],
                ['Serial number', a.serialNumber],
                ['Installed', formatDate(a.installDate)],
                ['Warranty until', formatDate(a.warrantyExpiresAt)],
                ['Last serviced', formatDate(a.lastServicedAt)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-3">{k}</dt>
                  <dd className="mt-0.5 break-words text-ink">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {a.warrantyExpiresAt && new Date(a.warrantyExpiresAt) < new Date() && (
              <p className="flex items-center gap-1.5 border-t border-line-subtle px-5 py-2.5 text-xs text-warning-ink"><Archive className="size-3.5" /> Warranty expired</p>
            )}
          </Card>
          <QrPanel kind="assets" id={a.id} label={a.name} sub={a.assetTag} reportUrl={a.reportUrl} />
        </div>
      </div>
      {editing && <AssetDialog asset={a} onClose={() => { setEditing(false); void asset.refetch(); }} />}
    </>
  );
}
