'use client';

import { Camera, Check, ListChecks, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SUBMISSION_ISSUE_MESSAGES, type AttachmentDto, type SubmissionIssue, type WorkOrderDetail } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { isApiError, uploadFile } from '@/lib/api';
import { cn, newIdempotencyKey } from '@/lib/utils';
import { useCacheWorkOrder, useTransition } from './use-work-order';

export function SubmitResolutionDialog({ open, onOpenChange, wo }: { open: boolean; onOpenChange: (o: boolean) => void; wo: WorkOrderDetail }) {
  const t = useTransition(wo);
  const cache = useCacheWorkOrder();
  const [notes, setNotes] = useState('');
  const [labor, setLabor] = useState('');
  const [parts, setParts] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [uploads, setUploads] = useState<AttachmentDto[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const photos = [...wo.attachments.filter((a) => a.contentType.startsWith('image/')), ...uploads.filter((u) => !wo.attachments.some((a) => a.id === u.id))];
  const openRequired = wo.checklist.filter((c) => c.required && !c.completedAt).length;

  useEffect(() => {
    if (open) {
      setIssues([]);
      setSelected(wo.attachments.filter((a) => a.kind === 'EVIDENCE').map((a) => a.id));
    }
  }, [open, wo.attachments]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProgress(0);
    try {
      const a = await uploadFile<AttachmentDto>(`/work-orders/${wo.id}/attachments?kind=EVIDENCE`, file, file.name, setProgress, newIdempotencyKey());
      setUploads((u) => [...u, a]);
      setSelected((s) => [...s, a.id]);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Upload failed');
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = () => {
    setIssues([]);
    t.mutate(
      {
        action: 'submit_resolution',
        notes: notes.trim(),
        laborMinutes: labor ? Number(labor) : undefined,
        partsUsed: parts.trim() || undefined,
        attachmentIds: selected,
      },
      {
        onSuccess: (data) => {
          if (data) cache(data);
          toast.success('Submitted for verification', { description: 'The requester and managers have been notified.' });
          onOpenChange(false);
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'SUBMISSION_INCOMPLETE') {
            setIssues((e.problem.reasons ?? []).map((r) => SUBMISSION_ISSUE_MESSAGES[r as SubmissionIssue] ?? r));
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Submit for verification"
        description="Describe the repair and attach photo evidence. The requester or a manager will review it."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} loading={t.isPending} disabled={notes.trim().length < 10 || progress !== null}>
              <Send /> Submit resolution
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {issues.length > 0 && (
            <Alert tone="danger" title="Almost there">
              <ul className="list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
            </Alert>
          )}
          {openRequired > 0 && (
            <Alert tone="warning">
              <span className="inline-flex items-center gap-1.5"><ListChecks className="size-4" /> {openRequired} required checklist item{openRequired === 1 ? ' is' : 's are'} still open.</span>
            </Alert>
          )}
          <Field label="Work performed" htmlFor="notes" hint="At least 10 characters. Visible to the requester.">
            <Textarea id="notes" autoFocus rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was wrong, what you did, and how you verified it works." maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Labor time (minutes)" htmlFor="labor" optional>
              <Input id="labor" type="number" inputMode="numeric" min={0} value={labor} onChange={(e) => setLabor(e.target.value)} placeholder="45" />
            </Field>
            <Field label="Parts used" htmlFor="parts" optional>
              <Input id="parts" value={parts} onChange={(e) => setParts(e.target.value)} placeholder="e.g. 35µF run capacitor ×1" />
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-2">Photo evidence</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" id="evidence-file" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button asChild variant="secondary" size="sm">
                <label htmlFor="evidence-file" className="cursor-pointer">
                  <Camera /> Add photo
                </label>
              </Button>
            </div>
            {progress !== null && <Progress label="Upload progress" value={progress} className="mb-3" />}
            {photos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3">Add an “after” photo showing the completed repair.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${on ? 'Remove' : 'Include'} ${p.fileName}`}
                        onClick={() => setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                        className={cn('relative block aspect-square w-full overflow-hidden rounded-lg border-2 transition-all', on ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumbnailUrl ?? p.url} alt="" className="size-full object-cover" />
                        {on && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-brand text-white shadow"><Check className="size-3" strokeWidth={3} /></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
