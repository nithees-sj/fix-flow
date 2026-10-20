'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Archive, Boxes, ChevronRight, MapPin, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ASSET_STATUS_META, LOCATION_TYPE_LABELS, formatWorkOrderNumber, type AssetSummary, type LocationDto, type WorkOrderSummary } from '@fixflow/shared';
import { LocationDialog } from '@/components/locations/location-dialog';
import { QrPanel } from '@/components/qr/qr-panel';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { StatusBadge } from '@/components/work-orders/badges';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';

type Detail = LocationDto & { children: LocationDto[]; assets: AssetSummary[]; recentWorkOrders: WorkOrderSummary[]; reportUrl: string | null };

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useActor();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const q = useQuery({ queryKey: qk.location(id), queryFn: () => api<Detail>(`/locations/${id}`) });
  const archive = useMutation({
    mutationFn: () => api(`/locations/${id}/archive`, { method: 'POST' }),
    onSuccess: () => { toast.success('Location archived'); router.push('/locations'); },
    onError: (e) => { setArchiving(false); toast.error(errorMessage(e)); },
  });
  const l = q.data;
  if (q.isError) return <Card><EmptyState icon={<MapPin />} title="Location not found" /></Card>;
  if (!l) return <Skeleton className="h-64" />;
  const crumbs = l.path.split(' › ');
  const manage = can('location.manage');

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-[13px] text-ink-3">
        <Link href="/locations" className="hover:text-ink">Locations</Link>
        {crumbs.slice(0, -1).map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1"><ChevronRight className="size-3.5" />{c}</span>
        ))}
      </nav>
      <PageHeader
        title={l.name}
        meta={<><Badge>{LOCATION_TYPE_LABELS[l.type]}</Badge>{l.code && <span className="font-mono text-xs text-ink-3">{l.code}</span>}{l.archived && <Badge tone="amber">Archived</Badge>}</>}
        actions={
          <>
            {manage && <Button variant="ghost" size="sm" onClick={() => setArchiving(true)}><Archive /> Archive</Button>}
            {manage && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
            {manage && l.type !== 'ROOM' && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus /> Add inside</Button>}
            <Button asChild size="sm"><Link href={`/work-orders/new?location=${l.id}`}><Plus /> Report issue here</Link></Button>
          </>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4">
          {l.children.length > 0 && (
            <Card>
              <CardHeader title="Inside this location" />
              <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
                {l.children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/locations/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 hover:border-line-strong hover:bg-surface-sunken">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{c.name}</span><span className="text-xs text-ink-3">{LOCATION_TYPE_LABELS[c.type]}</span></span>
                      {c.openWorkOrders > 0 && <Badge tone="amber">{c.openWorkOrders} open</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Assets" description={`${l.assets.length} item${l.assets.length === 1 ? '' : 's'} here and below`} />
            {l.assets.length === 0 ? (
              <EmptyState compact icon={<Boxes />} title="No assets recorded here" />
            ) : (
              <ul className="divide-y divide-line-subtle px-2 pb-2">
                {l.assets.map((a) => (
                  <li key={a.id}>
                    <Link href={`/assets/${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-sunken">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink">{a.name}</span><span className="font-mono text-xs text-ink-3">{a.assetTag}</span></span>
                      <Badge tone={ASSET_STATUS_META[a.status].tone} dot>{ASSET_STATUS_META[a.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {l.recentWorkOrders.length > 0 && (
            <Card>
              <CardHeader title="Recent work orders" />
              <ul className="divide-y divide-line-subtle px-2 pb-2">
                {l.recentWorkOrders.map((w) => (
                  <li key={w.id}>
                    <Link href={`/work-orders/${w.number}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-sunken">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink"><span className="mr-1.5 font-mono text-xs text-ink-3">{formatWorkOrderNumber(w.number)}</span>{w.title}</span>
                      <span className="hidden text-xs text-ink-3 sm:inline">{timeAgo(w.createdAt)}</span>
                      <StatusBadge status={w.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <QrPanel kind="locations" id={l.id} label={l.name} sub={l.code ?? l.path} reportUrl={l.reportUrl} />
      </div>
      {editing && <LocationDialog parent={null} existing={l} onClose={() => { setEditing(false); void q.refetch(); }} />}
      {adding && <LocationDialog parent={l} onClose={() => { setAdding(false); void q.refetch(); }} />}
      <ConfirmDialog open={archiving} onOpenChange={setArchiving} title={`Archive ${l.name}?`} description="Archived locations disappear from pickers and QR labels stop working. Locations with active work or sub-locations cannot be archived." confirmLabel="Archive" tone="danger" loading={archive.isPending} onConfirm={() => archive.mutate()} />
    </>
  );
}
