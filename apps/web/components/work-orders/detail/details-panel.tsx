import { CalendarClock, MapPin, QrCode, RotateCcw, Boxes, Wrench } from 'lucide-react';
import Link from 'next/link';
import { SOURCE_LABELS, type SubmissionDto, type WorkOrderDetail } from '@fixflow/shared';
import { Badge, Card, CardHeader, PersonChip } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CategoryChip, PriorityBadge, SlaIndicator } from '../badges';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 py-2">
      <dt className="pt-0.5 text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function SlaBlock({ label, clock }: { label: string; clock: WorkOrderDetail['response'] }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2.5">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <div className="mt-1">
        <SlaIndicator clock={clock} label={label} size="md" />
      </div>
      <p className="mt-1 text-xs text-ink-4">
        {clock.completedAt ? `Done ${formatDateTime(clock.completedAt)}` : `Due ${formatDateTime(clock.dueAt)}`}
      </p>
    </div>
  );
}

export function DetailsPanel({ wo }: { wo: WorkOrderDetail }) {
  return (
    <Card>
      <CardHeader title="Details" />
      <div className="grid grid-cols-2 gap-2 px-5">
        <SlaBlock label="Response" clock={wo.response} />
        <SlaBlock label="Resolution" clock={wo.resolution} />
      </div>
      <dl className="divide-y divide-line-subtle px-5 py-2">
        <Row label="Assignee">{wo.assignee ? <PersonChip name={wo.assignee.name} size="xs" /> : <span className="text-ink-3">Unassigned</span>}</Row>
        <Row label="Requested by">
          {wo.requester ? (
            <PersonChip name={wo.requester.name} size="xs" />
          ) : wo.guestName ? (
            <span>
              {wo.guestName} <Badge tone="amber">Guest</Badge>
              {wo.guestContact && <span className="block text-xs text-ink-3">{wo.guestContact}</span>}
            </span>
          ) : (
            <span className="text-ink-3">Preventive maintenance</span>
          )}
        </Row>
        <Row label="Priority"><PriorityBadge priority={wo.priority} /></Row>
        <Row label="Category"><CategoryChip category={wo.category} /></Row>
        <Row label="Location">
          {wo.location ? (
            <Link href={`/locations/${wo.location.id}`} className="inline-flex items-start gap-1.5 hover:text-brand-ink">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
              <span>{wo.location.path}</span>
            </Link>
          ) : (
            '—'
          )}
        </Row>
        {wo.asset && (
          <Row label="Asset">
            <Link href={`/assets/${wo.asset.id}`} className="inline-flex items-center gap-1.5 hover:text-brand-ink">
              <Boxes className="size-3.5 text-ink-4" />
              {wo.asset.name} <span className="font-mono text-xs text-ink-3">{wo.asset.assetTag}</span>
            </Link>
          </Row>
        )}
        <Row label="Source">
          <span className="inline-flex items-center gap-1.5">
            {wo.source === 'QR' || wo.source === 'GUEST_QR' ? <QrCode className="size-3.5 text-ink-4" /> : wo.source === 'SCHEDULED' ? <CalendarClock className="size-3.5 text-ink-4" /> : <Wrench className="size-3.5 text-ink-4" />}
            {SOURCE_LABELS[wo.source]}
            {wo.schedule && (
              <Link href="/schedules" className="text-xs text-brand-ink hover:underline">
                {wo.schedule.title}
              </Link>
            )}
          </span>
        </Row>
        <Row label="Created">{formatDateTime(wo.createdAt)}</Row>
        {wo.resolvedAt && <Row label="Resolved">{formatDateTime(wo.resolvedAt)}</Row>}
        {(wo.reopenCount > 0 || wo.reworkCount > 0) && (
          <Row label="History">
            <span className="inline-flex flex-wrap gap-1.5">
              {wo.reopenCount > 0 && <Badge tone="amber"><RotateCcw className="size-3" /> Reopened ×{wo.reopenCount}</Badge>}
              {wo.reworkCount > 0 && <Badge tone="red">Rework ×{wo.reworkCount}</Badge>}
            </span>
          </Row>
        )}
      </dl>
    </Card>
  );
}

export function SubmissionsCard({ submissions, onPreview }: { submissions: SubmissionDto[]; onPreview: (url: string) => void }) {
  if (!submissions.length) return null;
  return (
    <Card>
      <CardHeader title="Resolution evidence" description="Submitted repairs and their verification" />
      <ol className="grid gap-3 px-5 pb-5">
        {submissions.map((s) => (
          <li key={s.id} className={cn('rounded-lg border p-4', s.outcome === 'APPROVED' ? 'border-emerald-200 bg-success-soft/40' : s.outcome === 'REJECTED' ? 'border-red-200 bg-danger-soft/40' : 'border-violet-200 bg-violet-50/50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-ink-2">
                <span className="font-medium text-ink">{s.submittedBy.name}</span> · {formatDateTime(s.submittedAt)}
                {s.laborMinutes ? ` · ${s.laborMinutes} min labor` : ''}
              </p>
              <Badge tone={s.outcome === 'APPROVED' ? 'green' : s.outcome === 'REJECTED' ? 'red' : 'violet'} dot>
                {s.outcome === 'PENDING' ? 'Awaiting review' : s.outcome === 'APPROVED' ? 'Approved' : 'Rejected'}
              </Badge>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{s.notes}</p>
            {s.partsUsed && <p className="mt-1 text-[13px] text-ink-3">Parts: {s.partsUsed}</p>}
            {s.attachments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.attachments.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onPreview(a.url)} className="block size-20 overflow-hidden rounded-md border border-line bg-surface" aria-label={`View ${a.fileName}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.thumbnailUrl ?? a.url} alt="" className="size-full object-cover" loading="lazy" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {s.reviewedBy && (
              <p className="mt-3 border-t border-line-subtle pt-2 text-[13px] text-ink-2">
                <span className="font-medium">{s.reviewedBy.name}</span> {s.outcome === 'APPROVED' ? 'approved' : 'rejected'} · {formatDateTime(s.reviewedAt)}
                {s.reviewNote && <span className="block text-ink-3">“{s.reviewNote}”</span>}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
