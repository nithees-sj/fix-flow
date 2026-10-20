'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ASSET_STATUSES, ASSET_STATUS_META, type AssetSummary, type Paginated } from '@fixflow/shared';
import { AssetDialog } from '@/components/assets/asset-dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/display';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { DataTable, Pagination, type Column } from '@/components/ui/table';
import { CategoryChip } from '@/components/work-orders/badges';
import { api } from '@/lib/api';
import { formatDate, shortPath } from '@/lib/format';
import { useCategories, useLocations } from '@/lib/queries';
import { useActor } from '@/lib/session';
import { useUrlState } from '@/lib/use-url-state';

const DEFAULTS = { q: '', status: '', categoryId: '', locationId: '', sort: 'name', order: 'asc', page: '1' };

function AssetsInner() {
  const router = useRouter();
  const { can } = useActor();
  const [s, set] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(s.q);
  const [creating, setCreating] = useState(false);
  const categories = useCategories();
  const locations = useLocations();
  useEffect(() => {
    const t = setTimeout(() => s.q !== search && set({ q: search }), 250);
    return () => clearTimeout(t);
  }, [search, s.q, set]);

  const query = { q: s.q || undefined, status: s.status || undefined, categoryId: s.categoryId || undefined, locationId: s.locationId || undefined, sort: s.sort, order: s.order, page: s.page, pageSize: '25' };
  const list = useQuery({ queryKey: ['assets', 'list', query], queryFn: () => api<Paginated<AssetSummary>>('/assets', { query }), placeholderData: keepPreviousData });

  const columns: Column<AssetSummary>[] = [
    {
      key: 'name',
      header: 'Asset',
      sortKey: 'name',
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{a.name}</p>
          <p className="mt-0.5 font-mono text-xs text-ink-3">{a.assetTag}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortKey: 'status', cell: (a) => <Badge tone={ASSET_STATUS_META[a.status].tone} dot>{ASSET_STATUS_META[a.status].label}</Badge> },
    { key: 'category', header: 'Category', cell: (a) => <CategoryChip category={a.category} />, hideBelow: 'md' },
    { key: 'location', header: 'Location', cell: (a) => <span className="text-[13px] text-ink-2">{shortPath(a.location.path, 2)}</span>, hideBelow: 'lg' },
    { key: 'open', header: 'Open work', sortKey: 'openWorkOrders', cell: (a) => (a.openWorkOrders ? <Badge tone="amber">{a.openWorkOrders} open</Badge> : <span className="text-xs text-ink-4">None</span>), hideBelow: 'sm' },
    { key: 'serviced', header: 'Last serviced', cell: (a) => <span className="text-xs text-ink-3">{formatDate(a.lastServicedAt)}</span>, hideBelow: 'xl' },
  ];

  const locOptions = useMemo(() => (locations.data ?? []).map((l) => ({ value: l.id, label: l.name, description: l.path })), [locations.data]);

  return (
    <>
      <PageHeader
        title="Assets"
        description="Equipment inventory with status, location and maintenance history."
        actions={can('asset.manage') && <Button size="sm" onClick={() => setCreating(true)}><Plus /> Add asset</Button>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3 sm:px-5">
          <div className="w-full sm:w-64">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, tag, serial or model" aria-label="Search assets" leading={<Search />} className="h-8 text-[13px]" />
          </div>
          <FilterSelect label="Status" value={s.status ? s.status.split(',') : []} onChange={(v) => set({ status: v.join(',') })} options={ASSET_STATUSES.map((x) => ({ value: x, label: ASSET_STATUS_META[x].label }))} />
          <FilterSelect label="Category" single value={s.categoryId ? [s.categoryId] : []} onChange={(v) => set({ categoryId: v[0] ?? '' })} options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <div className="w-56">
            <Combobox value={s.locationId || null} onChange={(v) => set({ locationId: v ?? '' })} options={locOptions} placeholder="Any location" searchPlaceholder="Search locations…" clearable />
          </div>
          <p className="ml-auto text-xs text-ink-3 tabular">{list.data ? `${list.data.meta.total} assets` : ''}</p>
        </div>
        <DataTable
          caption="Assets"
          columns={columns}
          rows={list.data?.data}
          rowKey={(a) => a.id}
          loading={list.isLoading}
          onRowClick={(a) => router.push(`/assets/${a.id}`)}
          sort={{ key: s.sort, order: s.order as 'asc' | 'desc' }}
          onSortChange={(key, order) => set({ sort: key, order })}
          empty={<EmptyState icon={<Boxes />} title="No assets found" description={s.q || s.status ? 'Try a different search or filter.' : 'Add equipment so people can report issues against it.'} />}
        />
        {list.data && <Pagination page={list.data.meta.page} pageCount={list.data.meta.pageCount} total={list.data.meta.total} pageSize={list.data.meta.pageSize} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} noun="assets" />}
      </Card>
      {creating && <AssetDialog onClose={() => setCreating(false)} />}
    </>
  );
}

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetsInner />
    </Suspense>
  );
}
