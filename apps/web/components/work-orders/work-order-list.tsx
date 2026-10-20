'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  PRIORITIES,
  PRIORITY_META,
  STATUS_META,
  WORK_ORDER_STATUSES,
  formatWorkOrderNumber,
  type Paginated,
  type WorkOrderSummary,
} from '@fixflow/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Card, EmptyState, PersonChip } from '@/components/ui/display';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { DataTable, Pagination, type Column } from '@/components/ui/table';
import { api } from '@/lib/api';
import { shortPath, timeAgo } from '@/lib/format';
import { useCategories, useTechnicians } from '@/lib/queries';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { CategoryChip, PriorityBadge, SlaIndicator, StatusBadge } from './badges';

export interface SavedView {
  key: string;
  label: string;
  query: Record<string, string>;
}

const DEFAULTS = { view: '', q: '', status: '', priority: '', categoryId: '', assigneeId: '', overdue: '', sort: 'createdAt', order: 'desc', page: '1' };

export function WorkOrderList({ views, base = {}, showAssignee = true, emptyAction }: { views: SavedView[]; base?: Record<string, string>; showAssignee?: boolean; emptyAction?: React.ReactNode }) {
  const router = useRouter();
  const { isManager } = useActor();
  const defaults = useMemo(() => ({ ...DEFAULTS, view: views[0]?.key ?? '' }), [views]);
  const [s, set] = useUrlState(defaults);
  const [search, setSearch] = useState(s.q ?? '');
  const categories = useCategories();
  const techs = useTechnicians(isManager && showAssignee);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((s.q ?? '') !== search) set({ q: search });
    }, 250);
    return () => clearTimeout(t);
  }, [search, s.q, set]);

  const view = views.find((v) => v.key === s.view) ?? views[0]!;
  const query: Record<string, string | undefined> = {
    ...base,
    ...view.query,
    q: s.q || undefined,
    status: s.status || view.query.status,
    priority: s.priority || undefined,
    categoryId: s.categoryId || undefined,
    assigneeId: s.assigneeId || view.query.assigneeId || base.assigneeId,
    overdue: s.overdue || view.query.overdue,
    sort: s.sort,
    order: s.order,
    page: s.page,
    pageSize: '25',
  };

  const list = useQuery({
    queryKey: qk.workOrders(query),
    queryFn: () => api<Paginated<WorkOrderSummary>>('/work-orders', { query }),
    placeholderData: keepPreviousData,
  });

  const split = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
  const hasFilters = !!(s.q || s.status || s.priority || s.categoryId || s.assigneeId || s.overdue);

  const columns: Column<WorkOrderSummary>[] = [
    {
      key: 'title',
      header: 'Work order',
      sortKey: 'number',
      cell: (w) => (
        <div className="min-w-0 max-w-[420px]">
          <Link href={`/work-orders/${w.number}`} className="block truncate font-medium text-ink hover:text-brand-ink" onClick={(e) => e.stopPropagation()}>
            <span className="mr-1.5 font-mono text-xs font-normal text-ink-3">{formatWorkOrderNumber(w.number)}</span>
            {w.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-ink-3">{w.asset ? `${w.asset.name} · ` : ''}{shortPath(w.location?.path) || 'No location'}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortKey: 'status', cell: (w) => <StatusBadge status={w.status} /> },
    { key: 'priority', header: 'Priority', sortKey: 'priority', cell: (w) => <PriorityBadge priority={w.priority} />, hideBelow: 'sm' },
    { key: 'category', header: 'Category', cell: (w) => <CategoryChip category={w.category} />, hideBelow: 'lg' },
    ...(showAssignee
      ? [
          {
            key: 'assignee',
            header: 'Assignee',
            cell: (w: WorkOrderSummary) => (w.assignee ? <PersonChip name={w.assignee.name} size="xs" /> : <span className="text-xs text-ink-4">Unassigned</span>),
            hideBelow: 'md' as const,
          },
        ]
      : []),
    {
      key: 'sla',
      header: 'SLA',
      sortKey: 'resolutionDueAt',
      cell: (w) =>
        w.status === 'CANCELLED' ? (
          <span className="text-xs text-ink-4">—</span>
        ) : (
          <SlaIndicator clock={w.response.completedAt ? w.resolution : w.response} label={w.response.completedAt ? 'Resolution' : 'Response'} />
        ),
      hideBelow: 'md',
    },
    { key: 'created', header: 'Created', sortKey: 'createdAt', cell: (w) => <span className="whitespace-nowrap text-xs text-ink-3">{timeAgo(w.createdAt)}</span>, hideBelow: 'xl' },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-subtle px-4 pt-3 sm:px-5">
        <div role="tablist" aria-label="Views" className="-mb-px flex gap-1 overflow-x-auto scrollbar-thin">
          {views.map((v) => (
            <button
              key={v.key}
              role="tab"
              type="button"
              aria-selected={view.key === v.key}
              onClick={() => set({ view: v.key, status: '', overdue: '', assigneeId: '' })}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors',
                view.key === v.key ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3 sm:px-5">
        <div className="w-full sm:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, asset tag or WO-number"
            aria-label="Search work orders"
            leading={<Search />}
            className="h-8 text-[13px]"
          />
        </div>
        {!view.query.status && (
          <FilterSelect
            label="Status"
            value={split(s.status)}
            onChange={(v) => set({ status: v.join(',') })}
            options={WORK_ORDER_STATUSES.map((x) => ({ value: x, label: STATUS_META[x].label }))}
          />
        )}
        <FilterSelect label="Priority" value={split(s.priority)} onChange={(v) => set({ priority: v.join(',') })} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        <FilterSelect
          label="Category"
          single
          value={split(s.categoryId)}
          onChange={(v) => set({ categoryId: v[0] ?? '' })}
          options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        {isManager && showAssignee && !view.query.assigneeId && (
          <FilterSelect
            label="Assignee"
            single
            value={split(s.assigneeId)}
            onChange={(v) => set({ assigneeId: v[0] ?? '' })}
            options={[{ value: 'unassigned', label: 'Unassigned' }, ...(techs.data?.data ?? []).map((t) => ({ value: t.userId, label: t.name }))]}
          />
        )}
        {!view.query.overdue && (
          <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <Switch checked={s.overdue === 'true'} onCheckedChange={(c) => set({ overdue: c ? 'true' : '' })} aria-label="Overdue only" />
            Overdue only
          </label>
        )}
        {hasFilters && (
          <Button variant="ghost" size="xs" onClick={() => { setSearch(''); set({ q: '', status: '', priority: '', categoryId: '', assigneeId: '', overdue: '' }); }}>
            <X /> Clear
          </Button>
        )}
        <p className="ml-auto text-xs text-ink-3 tabular" aria-live="polite">
          {list.data ? `${list.data.meta.total.toLocaleString()} work order${list.data.meta.total === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      <div className={cn('transition-opacity', list.isFetching && list.data && 'opacity-60')}>
        <DataTable
          caption="Work orders"
          columns={columns}
          rows={list.data?.data}
          rowKey={(w) => w.id}
          loading={list.isLoading}
          onRowClick={(w) => router.push(`/work-orders/${w.number}`)}
          sort={{ key: s.sort ?? 'createdAt', order: (s.order as 'asc' | 'desc') ?? 'desc' }}
          onSortChange={(key, order) => set({ sort: key, order }, { resetPage: true })}
          empty={
            <EmptyState
              icon={<ClipboardList />}
              title={hasFilters ? 'No matching work orders' : 'Nothing here yet'}
              description={hasFilters ? 'Try removing a filter or searching for something else.' : 'New requests will appear here as soon as they are reported.'}
              action={emptyAction}
            />
          }
        />
      </div>
      {list.data && (
        <Pagination
          page={list.data.meta.page}
          pageCount={list.data.meta.pageCount}
          total={list.data.meta.total}
          pageSize={list.data.meta.pageSize}
          onPageChange={(p) => set({ page: String(p) }, { resetPage: false })}
          noun="work orders"
        />
      )}
    </Card>
  );
}
