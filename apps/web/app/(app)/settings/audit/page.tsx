'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { AuditLogDto, CursorPage } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const ENTITIES = ['WorkOrder', 'Organization', 'Membership', 'Invitation', 'Asset', 'Location', 'Category', 'ChecklistTemplate', 'SlaPolicy', 'MaintenanceSchedule', 'Report'];

function describe(a: AuditLogDto): string {
  const [entity, verb] = a.action.split('.');
  const m = a.metadata as Record<string, unknown>;
  const words = (verb ?? '').replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  const label = typeof m.number === 'number' ? ` WO-${String(m.number).padStart(4, '0')}` : typeof m.name === 'string' ? ` “${m.name}”` : typeof m.title === 'string' ? ` “${m.title}”` : typeof m.email === 'string' ? ` ${m.email}` : '';
  return `${entity?.replace(/([A-Z])/g, ' $1').toLowerCase()} ${words}${label}`.trim();
}

export default function AuditSettings() {
  const [entityType, setEntityType] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['audit', entityType],
    queryFn: ({ pageParam }) => api<CursorPage<AuditLogDto>>('/audit-logs', { query: { limit: 40, cursor: pageParam, entityType: entityType || undefined } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <SettingsSection title="Audit log" description="Every change is recorded with who made it, when and from where. Entries cannot be edited or deleted.">
      <div className="mb-3 w-56">
        <NativeSelect aria-label="Filter by type" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All activity</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e.replace(/([A-Z])/g, ' $1').trim()}</option>)}
        </NativeSelect>
      </div>
      {q.isLoading && <div className="grid gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
      {!q.isLoading && rows.length === 0 && <EmptyState compact icon={<History />} title="No audit entries" />}
      <ol className="divide-y divide-line-subtle">
        {rows.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-2.5">
            {a.actor ? <Avatar name={a.actor.name} size="sm" /> : <span className="grid size-6 place-items-center rounded-full bg-surface-muted text-[9px] font-semibold text-ink-3">SYS</span>}
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="text-ink-2">
                <span className="font-medium text-ink">{a.actor?.name ?? 'FixFlow automation'}</span> {describe(a)}
                {a.entityType === 'WorkOrder' && typeof (a.metadata as { number?: number }).number === 'number' && (
                  <Link href={`/work-orders/${(a.metadata as { number: number }).number}`} className="ml-1.5 text-brand-ink hover:underline">View</Link>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-4">{formatDateTime(a.createdAt)}{a.ip ? ` · ${a.ip}` : ''}</p>
            </div>
            <Badge tone="neutral" className="hidden font-mono text-[11px] sm:inline-flex">{a.action}</Badge>
          </li>
        ))}
      </ol>
      {q.hasNextPage && <div className="pt-3 text-center"><Button variant="ghost" size="sm" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load older entries</Button></div>}
    </SettingsSection>
  );
}
