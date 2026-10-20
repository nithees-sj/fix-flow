'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, ArrowRight, CircleDot, Lock, Paperclip, Send, ShieldAlert, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TimelineEntry, WorkOrderDetail } from '@fixflow/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Avatar, Card, CardHeader, Skeleton } from '@/components/ui/display';
import { Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { queueOrRun } from '@/lib/offline/outbox';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';
import { cn } from '@/lib/utils';
import { StatusBadge } from '../badges';

const SLA_LABEL = {
  RESPONSE_WARNING: 'Response SLA at risk',
  RESPONSE_BREACH: 'Response SLA missed',
  RESOLUTION_WARNING: 'Resolution SLA at risk',
  RESOLUTION_BREACH: 'Resolution SLA missed',
} as const;

function Icon({ children, tone = 'bg-surface-muted text-ink-3' }: { children: React.ReactNode; tone?: string }) {
  return <span className={cn('relative z-[1] grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-surface [&_svg]:size-3.5', tone)}>{children}</span>;
}

function Entry({ e }: { e: TimelineEntry }) {
  const who = 'actor' in e && e.actor ? e.actor.name : 'FixFlow';
  const time = (
    <time dateTime={e.at} title={formatDateTime(e.at)} className="ml-1.5 text-xs text-ink-4">
      {timeAgo(e.at)}
    </time>
  );
  switch (e.kind) {
    case 'comment':
      return (
        <div className="flex gap-3">
          <Avatar name={who} size="sm" className="relative z-[1] ring-4 ring-surface" />
          <div className={cn('min-w-0 flex-1 rounded-lg border px-3.5 py-2.5', e.isInternal ? 'border-amber-200 bg-warning-soft/60' : 'border-line bg-surface')}>
            <p className="text-[13px]">
              <span className="font-medium text-ink">{who}</span>
              {e.isInternal && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-warning-ink">
                  <Lock className="size-3" /> Internal note
                </span>
              )}
              {time}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{e.body}</p>
          </div>
        </div>
      );
    case 'status':
      return (
        <Row icon={<Icon><CircleDot /></Icon>}>
          <span className="font-medium text-ink">{who}</span> {e.from === null ? 'reported this issue' : <>changed status to <StatusBadge status={e.to} className="mx-0.5 align-middle" /></>}
          {time}
          {e.reason && <p className="mt-1 text-[13px] text-ink-3">“{e.reason}”</p>}
        </Row>
      );
    case 'assignment':
      return (
        <Row icon={<Icon tone="bg-indigo-50 text-indigo-700"><UserCheck /></Icon>}>
          <span className="font-medium text-ink">{e.method === 'AUTO' ? 'Auto-assignment' : who}</span> {e.method === 'SELF' ? 'took this job' : <>assigned <span className="font-medium text-ink">{e.assignee.name}</span></>}
          {time}
        </Row>
      );
    case 'attachment':
      return (
        <Row icon={<Icon><Paperclip /></Icon>}>
          <span className="font-medium text-ink">{who}</span> attached <span className="text-ink">{e.fileName}</span>
          {time}
        </Row>
      );
    case 'submission':
      return (
        <Row icon={<Icon tone="bg-violet-50 text-violet-700"><Send /></Icon>}>
          <span className="font-medium text-ink">{who}</span> submitted a resolution
          {e.outcome !== 'PENDING' && <span className={cn('ml-1 text-xs font-medium', e.outcome === 'APPROVED' ? 'text-success-ink' : 'text-danger-ink')}>· {e.outcome.toLowerCase()}</span>}
          {time}
        </Row>
      );
    case 'sla':
      return (
        <Row icon={<Icon tone={e.type.endsWith('BREACH') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}>{e.type.endsWith('BREACH') ? <ShieldAlert /> : <AlarmClock />}</Icon>}>
          <span className="font-medium text-ink">{SLA_LABEL[e.type]}</span> <span className="text-ink-3">· due {formatDateTime(e.dueAt)}</span>
          {time}
        </Row>
      );
    case 'update':
      return (
        <Row icon={<Icon><ArrowRight /></Icon>}>
          <span className="font-medium text-ink">{who}</span> updated {Object.keys(e.changes).map((k) => k.replace(/Id$/, '')).join(', ') || 'details'}
          {e.changes.priority && (
            <span className="text-ink-3"> · priority {String(e.changes.priority.from).toLowerCase()} → {String(e.changes.priority.to).toLowerCase()}</span>
          )}
          {time}
        </Row>
      );
  }
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      {icon}
      <div className="min-w-0 flex-1 pt-1 text-sm text-ink-2">{children}</div>
    </div>
  );
}

export function TimelineCard({ wo }: { wo: WorkOrderDetail }) {
  const qc = useQueryClient();
  const { isRequester } = useActor();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const timeline = useQuery({ queryKey: qk.timeline(wo.id), queryFn: () => api<TimelineEntry[]>(`/work-orders/${wo.id}/timeline`) });

  const send = useMutation({
    mutationFn: () =>
      queueOrRun<TimelineEntry>({
        workOrderId: wo.id,
        kind: 'comment',
        label: internal ? 'Internal note' : 'Comment',
        path: `/work-orders/${wo.id}/comments`,
        method: 'POST',
        body: { body: body.trim(), isInternal: internal },
      }),
    onSuccess: (entry) => {
      setBody('');
      if (entry) qc.setQueryData<TimelineEntry[]>(qk.timeline(wo.id), (prev) => [...(prev ?? []), entry]);
      else toast.info('Saved offline — it will be posted when you reconnect.');
    },
    onError: () => toast.error('Could not post your comment'),
  });

  return (
    <Card>
      <CardHeader title="Activity" description="Status changes, assignments, files and conversation" />
      <div className="px-5 pb-2">
        {timeline.isLoading && (
          <div className="grid gap-4 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        )}
        <ol className="relative grid gap-4 py-1 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line" aria-label="Timeline">
          {timeline.data?.map((e) => (
            <li key={`${e.kind}-${e.id}`}>
              <Entry e={e} />
            </li>
          ))}
        </ol>
      </div>
      {wo.permissions.canComment && (
        <form
          className="border-t border-line-subtle p-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (body.trim()) send.mutate();
          }}
        >
          <label htmlFor="comment" className="sr-only">Add a comment</label>
          <Textarea id="comment" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Internal note — visible to staff only' : 'Write a comment…'} className={cn(internal && 'border-amber-300 bg-warning-soft/40')} maxLength={4000} />
          <div className="mt-2 flex items-center justify-between gap-3">
            {wo.permissions.canInternalNote && !isRequester ? (
              <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                <Switch checked={internal} onCheckedChange={setInternal} aria-label="Internal note" />
                <Lock className="size-3.5 text-ink-4" /> Internal note
              </label>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={!body.trim()} loading={send.isPending}>
              <Send /> {internal ? 'Add note' : 'Comment'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

