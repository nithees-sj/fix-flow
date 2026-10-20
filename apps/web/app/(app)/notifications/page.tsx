'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { NOTIFICATION_TYPE_META, type CursorPage, type NotificationDto } from '@fixflow/shared';
import { useMarkRead } from '@/components/app/notification-bell';
import { NotificationIcon } from '@/components/app/notification-icon';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Segmented } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { cn } from '@/lib/utils';

type Page = CursorPage<NotificationDto> & { unreadCount: number };

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const mark = useMarkRead();
  const q = useInfiniteQuery({
    queryKey: [...qk.notifications, 'center', filter],
    queryFn: ({ pageParam }) => api<Page>('/notifications', { query: { limit: 25, cursor: pageParam, unreadOnly: filter === 'unread' ? 'true' : undefined } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = q.data?.pages[0]?.unreadCount ?? 0;

  const open = (n: NotificationDto) => {
    if (!n.readAt) mark.one.mutate(n.id);
    if (n.workOrderNumber) router.push(`/work-orders/${n.workOrderNumber}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You’re all caught up'}
        actions={
          <>
            <Segmented ariaLabel="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
            <Button variant="secondary" size="sm" onClick={() => mark.all.mutate()} disabled={!unread} loading={mark.all.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <Card>
        {q.isLoading && (
          <div className="grid gap-4 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        )}
        {!q.isLoading && items.length === 0 && (
          <EmptyState icon={<BellOff />} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} description="Assignments, status changes, SLA warnings and comments will appear here in real time." />
        )}
        <ul className="divide-y divide-line-subtle">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={cn('flex w-full gap-3.5 px-5 py-4 text-left transition-colors hover:bg-surface-sunken', !n.readAt && 'bg-brand-soft/30')}>
                <NotificationIcon type={n.type} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('truncate text-sm', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                    {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-ink-3">{n.body}</span>
                  <span className="mt-1 block text-xs text-ink-4">
                    {NOTIFICATION_TYPE_META[n.type].label} · <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</time>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {q.hasNextPage && (
          <div className="border-t border-line-subtle p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load older</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
