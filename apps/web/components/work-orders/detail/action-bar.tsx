'use client';

import { useQuery } from '@tanstack/react-query';
import { Ban, Check, CheckCircle2, MoreHorizontal, Pause, Play, RotateCcw, Send, UserMinus, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TechnicianRecommendation, WorkOrderAction, WorkOrderDetail } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Badge, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { api, isApiError } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';
import { cn } from '@/lib/utils';
import { SubmitResolutionDialog } from './submit-resolution';
import { useTransition } from './use-work-order';

const REASON_ACTIONS: Partial<Record<WorkOrderAction, { title: string; description: string; label: string; placeholder: string; danger?: boolean }>> = {
  hold: { title: 'Put work on hold', description: 'Let the requester and managers know why work is paused.', label: 'Put on hold', placeholder: 'e.g. Waiting for a replacement capacitor from the supplier' },
  unassign: { title: 'Return to the queue', description: 'The work order goes back to managers for reassignment.', label: 'Unassign', placeholder: 'e.g. Needs a certified electrician' },
  reject: { title: 'Reject the resolution', description: 'The technician will be asked to rework it. Explain what is still wrong.', label: 'Reject resolution', placeholder: 'e.g. The AC is still not cooling the back rows', danger: true },
  reopen: { title: 'Reopen work order', description: 'Starts a new SLA cycle. The previous technician is reassigned if still available.', label: 'Reopen', placeholder: 'e.g. The leak has come back' },
  cancel: { title: 'Cancel work order', description: 'Cancelled work orders cannot be resumed.', label: 'Cancel work order', placeholder: 'e.g. Duplicate of WO-0042', danger: true },
};

export function ActionBar({ wo }: { wo: WorkOrderDetail }) {
  const { user, isTechnician } = useActor();
  const t = useTransition(wo);
  const [reasonFor, setReasonFor] = useState<WorkOrderAction | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const can = (a: WorkOrderAction) => wo.availableActions.includes(a);

  const run = (body: Parameters<typeof t.mutate>[0], success: string) =>
    t.mutate(body, { onSuccess: () => toast.success(success) });

  const primary: React.ReactNode[] = [];
  const secondary: React.ReactNode[] = [];
  const overflow: { action: WorkOrderAction; label: string; icon: React.ReactNode; danger?: boolean }[] = [];

  if (can('start')) primary.push(<Button key="start" onClick={() => run({ action: 'start' }, 'Work started — response time recorded')} loading={t.isPending}><Play /> Start work</Button>);
  if (can('resume')) primary.push(<Button key="resume" onClick={() => run({ action: 'resume' }, 'Work resumed')} loading={t.isPending}><Play /> Resume</Button>);
  if (can('submit_resolution')) primary.push(<Button key="submit" onClick={() => setSubmitOpen(true)}><Send /> Submit for verification</Button>);
  if (can('approve')) primary.push(<Button key="approve" onClick={() => setApproveOpen(true)}><CheckCircle2 /> Approve repair</Button>);
  if (can('reject')) secondary.push(<Button key="reject" variant="secondary" onClick={() => setReasonFor('reject')}><X /> Reject</Button>);
  if (can('assign')) {
    if (isTechnician) primary.push(<Button key="self" onClick={() => run({ action: 'assign', assigneeId: user!.id }, 'Assigned to you')} loading={t.isPending}><UserPlus /> Assign to me</Button>);
    else primary.push(<Button key="assign" onClick={() => setAssignOpen(true)}><UserPlus /> Assign technician</Button>);
  }
  if (can('reassign')) secondary.push(<Button key="reassign" variant="secondary" onClick={() => setAssignOpen(true)}><UserPlus /> Reassign</Button>);
  if (can('hold')) secondary.push(<Button key="hold" variant="secondary" onClick={() => setReasonFor('hold')}><Pause /> Put on hold</Button>);
  if (can('close')) secondary.push(<Button key="close" variant="secondary" onClick={() => run({ action: 'close' }, 'Work order closed')} loading={t.isPending}><Check /> Close</Button>);
  if (can('reopen')) secondary.push(<Button key="reopen" variant="secondary" onClick={() => setReasonFor('reopen')}><RotateCcw /> Reopen</Button>);
  if (can('unassign')) overflow.push({ action: 'unassign', label: isTechnician ? 'Decline assignment' : 'Unassign', icon: <UserMinus /> });
  if (can('cancel')) overflow.push({ action: 'cancel', label: 'Cancel work order', icon: <Ban />, danger: true });

  const reason = reasonFor ? REASON_ACTIONS[reasonFor] : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {primary}
        {secondary}
        {overflow.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {overflow.map((o) => (
                <MenuItem key={o.action} tone={o.danger ? 'danger' : 'default'} onSelect={() => setReasonFor(o.action)}>
                  {o.icon} {o.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>

      {reason && reasonFor && (
        <ReasonDialog
          key={reasonFor}
          open
          onOpenChange={(o) => !o && setReasonFor(null)}
          {...reason}
          loading={t.isPending}
          onSubmit={(text) =>
            t.mutate({ action: reasonFor as 'hold', reason: text }, { onSuccess: () => { setReasonFor(null); toast.success(`${reason.label} — done`); } })
          }
        />
      )}
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} wo={wo} onAssign={(id) => t.mutate({ action: wo.assignee ? 'reassign' : 'assign', assigneeId: id }, { onSuccess: () => { setAssignOpen(false); toast.success('Technician assigned and notified'); } })} loading={t.isPending} />
      <SubmitResolutionDialog open={submitOpen} onOpenChange={setSubmitOpen} wo={wo} />
      <ApproveDialog open={approveOpen} onOpenChange={setApproveOpen} loading={t.isPending} onApprove={(note) => t.mutate({ action: 'approve', note: note || undefined }, { onSuccess: () => { setApproveOpen(false); toast.success('Repair verified — work order resolved'); } })} />
    </>
  );
}

function ReasonDialog({ open, onOpenChange, title, description, label, placeholder, danger, loading, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; label: string; placeholder: string; danger?: boolean; loading: boolean; onSubmit: (reason: string) => void }) {
  const [text, setText] = useState('');
  const valid = text.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Back</Button>
            <Button variant={danger ? 'danger' : 'primary'} disabled={!valid} loading={loading} onClick={() => onSubmit(text.trim())}>{label}</Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="reason" hint="Visible on the work order timeline.">
          <Textarea id="reason" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={3} maxLength={500} />
        </Field>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ open, onOpenChange, loading, onApprove }: { open: boolean; onOpenChange: (o: boolean) => void; loading: boolean; onApprove: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Approve the repair"
        description="Confirm the issue is fixed. The work order becomes resolved and the asset history is updated."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Back</Button>
            <Button loading={loading} onClick={() => onApprove(note.trim())}><CheckCircle2 /> Approve</Button>
          </>
        }
      >
        <Field label="Note for the technician" htmlFor="note" optional>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Working perfectly — thank you!" maxLength={500} />
        </Field>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onOpenChange, wo, onAssign, loading }: { open: boolean; onOpenChange: (o: boolean) => void; wo: WorkOrderDetail; onAssign: (id: string) => void; loading: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const suggestions = useQuery({
    queryKey: qk.suggestions(wo.id),
    queryFn: () => api<TechnicianRecommendation[]>(`/work-orders/${wo.id}/assignment-suggestions`),
    enabled: open,
  });
  const list = (suggestions.data ?? []).filter((s) => s.userId !== wo.assignee?.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={wo.assignee ? 'Reassign technician' : 'Assign a technician'}
        description={`Ranked by ${wo.category.name} skill and current workload. Unavailable technicians are excluded.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!selected} loading={loading} onClick={() => selected && onAssign(selected)}><UserPlus /> Assign</Button>
          </>
        }
      >
        {suggestions.isLoading && <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {suggestions.isError && <Alert tone="danger">{isApiError(suggestions.error) ? suggestions.error.message : 'Could not load technicians.'}</Alert>}
        {suggestions.data && list.length === 0 && <Alert tone="warning" title="No available technicians">Invite technicians or mark someone as available on the Team page.</Alert>}
        <div role="radiogroup" aria-label="Technicians" className="grid gap-2">
          {list.map((s, i) => (
            <button
              key={s.userId}
              type="button"
              role="radio"
              aria-checked={selected === s.userId}
              onClick={() => setSelected(s.userId)}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                selected === s.userId ? 'border-brand bg-brand-soft/60 ring-1 ring-brand/30' : 'border-line hover:border-line-strong hover:bg-surface-sunken',
              )}
            >
              <Avatar name={s.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {s.name}
                  {i === 0 && s.skillLevel !== null && <Badge tone="green">Best match</Badge>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-3">{s.reasons.join(' · ')}</span>
              </span>
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', selected === s.userId ? 'border-brand bg-brand text-white' : 'border-line-strong')}>
                {selected === s.userId && <Check className="size-3" strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

