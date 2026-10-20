'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CursorPage, NotificationDto } from '@fixflow/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { NotificationIcon } from './notification-icon';

type Page = CursorPage<NotificationDto> & { unreadCount: number };

export function useNotifications(limit = 8) {
  return useQuery({ queryKey: [...qk.notifications, 'latest', limit], queryFn: () => api<Page>('/notifications', { query: { limit } }), refetchInterval: 60_000 });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return {
    one: useMutation({
      mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
      onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    }),
    all: useMutation({
      mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
      onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    }),
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data, isLoading } = useNotifications();
  const mark = useMarkRead();
  const unread = data?.unreadCount ?? 0;

  const openItem = (n: NotificationDto) => {
    if (!n.readAt) mark.one.mutate(n.id);
    setOpen(false);
    if (n.workOrderNumber) router.push(`/work-orders/${n.workOrderNumber}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-surface tabular">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={() => mark.all.mutate()} disabled={!unread}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          {data?.data.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-3">You’re all caught up.</p>}
          {data?.data.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openItem(n)}
              className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken', !n.readAt && 'bg-brand-soft/40')}
            >
              <NotificationIcon type={n.type} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[13px]', n.readAt ? 'text-ink-2' : 'font-medium text-ink')}>{n.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-ink-3">{n.body}</span>
                <span className="mt-1 block text-[11px] text-ink-4">{timeAgo(n.createdAt)}</span>
              </span>
              {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
            </button>
          ))}
        </div>
        <div className="border-t border-line-subtle p-2">
          <Button asChild variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
