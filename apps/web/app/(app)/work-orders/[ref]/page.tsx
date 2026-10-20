'use client';

import { ChevronRight, ClipboardX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { formatWorkOrderNumber } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/display';
import { PriorityBadge, StatusBadge } from '@/components/work-orders/badges';
import { ActionBar } from '@/components/work-orders/detail/action-bar';
import { DetailsPanel, SubmissionsCard } from '@/components/work-orders/detail/details-panel';
import { AttachmentsCard, ChecklistCard } from '@/components/work-orders/detail/panels';
import { TimelineCard } from '@/components/work-orders/detail/timeline';
import { useWorkOrder } from '@/components/work-orders/detail/use-work-order';
import { isApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useWatchWorkOrder } from '@/lib/realtime';
import { useActor } from '@/lib/session';

export default function WorkOrderDetailPage() {
  const { ref } = useParams<{ ref: string }>();
  const { isRequester, isTechnician } = useActor();
  const q = useWorkOrder(ref);
  const wo = q.data;
  const [preview, setPreview] = useState<string | null>(null);
  useWatchWorkOrder(wo?.id);

  const back = isRequester ? { href: '/my-requests', label: 'My requests' } : isTechnician ? { href: '/my-work', label: 'My work' } : { href: '/work-orders', label: 'Work orders' };

  if (q.isError) {
    return (
      <Card>
        <EmptyState
          icon={<ClipboardX />}
          title={isApiError(q.error) && q.error.status === 404 ? 'Work order not found' : 'Could not load this work order'}
          description="It may not exist, or you may not have access to it."
          action={<Button asChild variant="secondary"><Link href={back.href}>Back to {back.label.toLowerCase()}</Link></Button>}
        />
      </Card>
    );
  }

  if (!wo) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-ink-3">
        <Link href={back.href} className="hover:text-ink">{back.label}</Link>
        <ChevronRight className="size-3.5" />
        <span className="font-mono text-ink-2">{formatWorkOrderNumber(wo.number)}</span>
      </nav>

      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-ink">{wo.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-3">
            <StatusBadge status={wo.status} />
            <PriorityBadge priority={wo.priority} />
            <span>Reported {timeAgo(wo.createdAt)}{wo.requester ? ` by ${wo.requester.name}` : wo.guestName ? ` by ${wo.guestName}` : ''}</span>
            {wo.isOverdue && <span className="font-medium text-danger-ink">Overdue</span>}
          </div>
        </div>
        <ActionBar wo={wo} />
      </header>

      {wo.status === 'PENDING_VERIFICATION' && wo.availableActions.includes('approve') && (
        <Alert tone="info" className="mb-4" title="Your review is needed">
          The technician has submitted the repair. Check the evidence below, then approve it or send it back with a reason.
        </Alert>
      )}
      {wo.status === 'ON_HOLD' && (
        <Alert tone="warning" className="mb-4" title="Work is on hold">See the latest activity for the reason.</Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <Card className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{wo.description || <span className="text-ink-4">No description provided.</span>}</p>
          </Card>
          <SubmissionsCard submissions={wo.submissions} onPreview={setPreview} />
          {(wo.checklist.length > 0 || wo.permissions.canEditChecklist) && <ChecklistCard wo={wo} />}
          {(wo.attachments.length > 0 || wo.permissions.canUpload) && <AttachmentsCard wo={wo} />}
          <TimelineCard wo={wo} />
        </div>
        <div className="grid gap-4 lg:sticky lg:top-20">
          <DetailsPanel wo={wo} />
        </div>
      </div>

      {preview && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Resolution evidence" className="max-h-[85dvh] max-w-full rounded-lg shadow-lg" />
          <button type="button" autoFocus className="absolute right-4 top-4 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white">Close</button>
        </div>
      )}
    </>
  );
}
