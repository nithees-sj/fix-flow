'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, ImagePlus, ListChecks, Paperclip, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AttachmentDto, ChecklistItemDto, WorkOrderDetail } from '@fixflow/shared';
import { Button } from '@/components/ui/button';
import { Checkbox, Progress } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { api, errorMessage, uploadFile } from '@/lib/api';
import { bytes, formatDateTime } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { cn, newIdempotencyKey } from '@/lib/utils';
import { queueOrRun } from '@/lib/offline/outbox';

export function ChecklistCard({ wo }: { wo: WorkOrderDetail }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const items = wo.checklist;
  const done = items.filter((i) => i.completedAt).length;
  const editable = wo.permissions.canEditChecklist;

  const patchCache = (item: ChecklistItemDto) => {
    for (const key of [qk.workOrder(wo.id), qk.workOrderByNumber(wo.number)]) {
      qc.setQueryData<WorkOrderDetail>(key, (prev) => (prev ? { ...prev, checklist: prev.checklist.map((c) => (c.id === item.id ? item : c)) } : prev));
    }
  };

  const toggle = useMutation({
    mutationFn: async (vars: { item: ChecklistItemDto; completed: boolean }) =>
      queueOrRun<ChecklistItemDto>({
        workOrderId: wo.id,
        kind: 'checklist',
        label: `${vars.completed ? 'Complete' : 'Reopen'} “${vars.item.label}”`,
        path: `/work-orders/${wo.id}/checklist/${vars.item.id}`,
        method: 'PUT',
        body: { completed: vars.completed },
      }),
    onMutate: ({ item, completed }) => patchCache({ ...item, completedAt: completed ? new Date().toISOString() : null }),
    onSuccess: (res) => res && patchCache(res),
    onError: (e, { item }) => {
      patchCache(item);
      toast.error(errorMessage(e));
    },
  });

  const add = useMutation({
    mutationFn: () => api<ChecklistItemDto>(`/work-orders/${wo.id}/checklist`, { method: 'POST', body: { label: label.trim(), required: false } }),
    onSuccess: () => {
      setLabel('');
      setAdding(false);
      void qc.invalidateQueries({ queryKey: qk.workOrder(wo.id) });
      void qc.invalidateQueries({ queryKey: qk.workOrderByNumber(wo.number) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader
        title="Checklist"
        description={items.length ? `${done} of ${items.length} completed` : 'No checklist for this work order'}
        action={
          editable && (
            <Button variant="ghost" size="xs" onClick={() => setAdding((a) => !a)}>
              <Plus /> Add step
            </Button>
          )
        }
      />
      {items.length > 0 && <Progress label="Checklist progress" value={(done / items.length) * 100} tone={done === items.length ? 'success' : 'brand'} className="mx-5 mb-2 w-auto" />}
      {items.length === 0 && !adding ? (
        <EmptyState compact icon={<ListChecks />} title="No steps yet" description={editable ? 'Add steps to track the work in detail.' : undefined} />
      ) : (
        <ul className="px-2 pb-3">
          {items.map((item) => (
            <li key={item.id}>
              <label className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', editable ? 'cursor-pointer hover:bg-surface-sunken' : 'cursor-default')}>
                <Checkbox
                  checked={!!item.completedAt}
                  disabled={!editable}
                  onCheckedChange={(c) => toggle.mutate({ item, completed: c === true })}
                  className="mt-0.5"
                  aria-label={item.label}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', item.completedAt ? 'text-ink-3 line-through decoration-ink-4' : 'text-ink')}>{item.label}</span>
                  {item.completedAt && (
                    <span className="block text-xs text-ink-4">
                      {item.completedBy?.name ?? 'Completed'} · {formatDateTime(item.completedAt)}
                    </span>
                  )}
                </span>
                {item.required && !item.completedAt && <Badge tone="neutral">Required</Badge>}
              </label>
            </li>
          ))}
          {adding && (
            <li className="flex gap-2 px-3 pt-2">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Describe the step" autoFocus aria-label="New checklist step" onKeyDown={(e) => e.key === 'Enter' && label.trim().length > 1 && add.mutate()} />
              <Button onClick={() => add.mutate()} disabled={label.trim().length < 2} loading={add.isPending}>Add</Button>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

export function AttachmentsCard({ wo }: { wo: WorkOrderDetail }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<AttachmentDto | null>(null);
  const files = wo.attachments;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Files must be 10 MB or smaller');
      return;
    }
    setProgress(0);
    try {
      await uploadFile(`/work-orders/${wo.id}/attachments?kind=${wo.permissions.canEditChecklist ? 'PROGRESS' : 'REPORT'}`, file, file.name, setProgress, newIdempotencyKey());
      toast.success('File uploaded');
      await qc.invalidateQueries({ queryKey: qk.workOrder(wo.id) });
      await qc.invalidateQueries({ queryKey: qk.workOrderByNumber(wo.number) });
      await qc.invalidateQueries({ queryKey: qk.timeline(wo.id) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader
        title="Photos & files"
        description="JPEG, PNG, WebP or PDF up to 10 MB"
        action={
          wo.permissions.canUpload && (
            <>
              <input ref={fileRef} id="wo-file" type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => upload(e.target.files?.[0])} />
              <Button asChild variant="secondary" size="xs">
                <label htmlFor="wo-file" className="cursor-pointer">
                  <ImagePlus /> Upload
                </label>
              </Button>
            </>
          )
        }
      />
      {progress !== null && <Progress label="Upload progress" value={progress} className="mx-5 mb-3 w-auto" />}
      {files.length === 0 ? (
        <EmptyState compact icon={<Paperclip />} title="No files yet" description={wo.permissions.canUpload ? 'Add photos of the problem or progress.' : undefined} />
      ) : (
        <ul className="grid grid-cols-3 gap-2 px-5 pb-5 sm:grid-cols-4">
          {files.map((f) => (
            <li key={f.id}>
              {f.contentType.startsWith('image/') ? (
                <button type="button" onClick={() => setPreview(f)} className="group block aspect-square w-full overflow-hidden rounded-lg border border-line bg-surface-muted" aria-label={`Preview ${f.fileName}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.thumbnailUrl ?? f.url} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
                </button>
              ) : (
                <a href={f.url} className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-sunken p-2 text-center text-xs text-ink-2 hover:border-line-strong">
                  <FileText className="size-6 text-ink-3" />
                  <span className="line-clamp-2 break-all">{f.fileName}</span>
                  <span className="text-ink-4">{bytes(f.sizeBytes)}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {preview && <ImagePreview file={preview} onClose={() => setPreview(null)} />}
    </Card>
  );
}

export function ImagePreview({ file, onClose }: { file: AttachmentDto; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={file.fileName} className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 animate-fade-in" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={file.url} alt={file.fileName} className="max-h-[85dvh] max-w-full rounded-lg shadow-lg" />
      <p className="mt-3 text-xs text-white/80">
        {file.fileName} · {file.uploadedBy?.name} · {formatDateTime(file.createdAt)}
      </p>
      <button type="button" autoFocus onClick={onClose} className="absolute right-4 top-4 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">
        Close
      </button>
    </div>
  );
}
