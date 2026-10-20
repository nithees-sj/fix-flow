'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Play, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PRIORITIES, PRIORITY_META, describeFrequency, type AssetSummary, type ChecklistTemplateDto, type Paginated, type ScheduleDto, type WorkOrderDetail } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { PriorityBadge } from '@/components/work-orders/badges';
import { api, errorMessage } from '@/lib/api';
import { dueIn, formatDate } from '@/lib/format';
import { useCategories, useTechnicians } from '@/lib/queries';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';

export default function SchedulesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { can } = useActor();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: qk.schedules, queryFn: () => api<ScheduleDto[]>('/schedules') });
  const manage = can('schedule.manage');
  const toggle = useMutation({
    mutationFn: (s: ScheduleDto) => api(`/schedules/${s.id}`, { method: 'PATCH', body: { active: !s.active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.schedules }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const runNow = useMutation({
    mutationFn: (s: ScheduleDto) => api<WorkOrderDetail>(`/schedules/${s.id}/run-now`, { method: 'POST' }),
    onSuccess: (wo) => { toast.success('Preventive work order created'); router.push(`/work-orders/${wo.number}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<ScheduleDto>[] = [
    { key: 'title', header: 'Schedule', cell: (s) => <div className="min-w-0"><p className="truncate font-medium text-ink">{s.title}</p><p className="mt-0.5 truncate text-xs text-ink-3">{s.asset ? `${s.asset.name} · ${s.asset.assetTag}` : s.location?.path}</p></div> },
    { key: 'freq', header: 'Frequency', cell: (s) => <span className="text-[13px]">{describeFrequency(s.frequencyUnit, s.frequencyInterval)}</span> },
    { key: 'next', header: 'Next due', cell: (s) => (s.active ? <span className="text-[13px]">{formatDate(s.nextDueAt)} <span className="text-xs text-ink-3">({dueIn(s.nextDueAt).label})</span></span> : <span className="text-xs text-ink-4">Paused</span>) },
    { key: 'priority', header: 'Priority', cell: (s) => <PriorityBadge priority={s.priority} />, hideBelow: 'lg' },
    { key: 'cat', header: 'Category', cell: (s) => <span className="text-[13px] text-ink-2">{s.category.name}</span>, hideBelow: 'xl' },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (s) =>
        manage && (
          <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
            <Switch checked={s.active} onCheckedChange={() => toggle.mutate(s)} aria-label={s.active ? `Pause ${s.title}` : `Resume ${s.title}`} />
            <Button size="xs" variant="secondary" onClick={() => runNow.mutate(s)} loading={runNow.isPending && runNow.variables?.id === s.id}><Play /> Run now</Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Preventive maintenance"
        description="Recurring inspections and services. FixFlow creates the work orders automatically ahead of each due date."
        actions={manage && <Button size="sm" onClick={() => setCreating(true)}><Plus /> New schedule</Button>}
      />
      <Card className="overflow-hidden">
        <DataTable caption="Maintenance schedules" columns={columns} rows={q.data} rowKey={(s) => s.id} loading={q.isLoading} empty={<EmptyState icon={<CalendarClock />} title="No schedules yet" description="Plan filter changes, generator tests and safety inspections so they never get missed." action={manage && <Button onClick={() => setCreating(true)}><Plus /> New schedule</Button>} />} />
      </Card>
      {creating && <ScheduleDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const categories = useCategories();
  const techs = useTechnicians();
  const assets = useQuery({ queryKey: ['assets', 'picker', 'all'], queryFn: () => api<Paginated<AssetSummary>>('/assets', { query: { pageSize: 100 } }) });
  const checklists = useQuery({ queryKey: qk.checklists, queryFn: () => api<ChecklistTemplateDto[]>('/checklist-templates') });
  const [v, setV] = useState({ title: '', categoryId: '', assetId: null as string | null, priority: 'MEDIUM', frequencyUnit: 'MONTH', frequencyInterval: 1, startsAt: new Date().toISOString().slice(0, 10), leadTimeDays: 1, checklistTemplateId: '', defaultAssigneeId: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const create = useMutation({
    mutationFn: () =>
      api('/schedules', {
        method: 'POST',
        body: {
          title: v.title,
          categoryId: v.categoryId,
          assetId: v.assetId,
          priority: v.priority,
          frequencyUnit: v.frequencyUnit,
          frequencyInterval: Number(v.frequencyInterval),
          startsAt: new Date(`${v.startsAt}T09:00:00`).toISOString(),
          leadTimeDays: Number(v.leadTimeDays),
          checklistTemplateId: v.checklistTemplateId || null,
          defaultAssigneeId: v.defaultAssigneeId || null,
        },
      }),
    onSuccess: () => { toast.success('Schedule created'); void qc.invalidateQueries({ queryKey: qk.schedules }); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="New maintenance schedule" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!v.title || !v.categoryId || !v.assetId} loading={create.isPending} onClick={() => create.mutate()}>Create schedule</Button></>}>
        {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="s-title" className="sm:col-span-2"><Input id="s-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="Monthly AC filter service" /></Field>
          <Field label="Asset" htmlFor="s-asset"><Combobox id="s-asset" value={v.assetId} onChange={(id) => { const a = assets.data?.data.find((x) => x.id === id); set({ assetId: id, categoryId: v.categoryId || a?.category.id || '' }); }} options={(assets.data?.data ?? []).map((a) => ({ value: a.id, label: a.name, description: a.assetTag }))} placeholder="Choose equipment" /></Field>
          <Field label="Category" htmlFor="s-cat"><NativeSelect id="s-cat" value={v.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">Select…</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
          <Field label="Repeat every" htmlFor="s-int">
            <div className="flex gap-2">
              <Input id="s-int" type="number" min={1} max={365} className="w-20" value={v.frequencyInterval} onChange={(e) => set({ frequencyInterval: Number(e.target.value) })} />
              <NativeSelect aria-label="Unit" value={v.frequencyUnit} onChange={(e) => set({ frequencyUnit: e.target.value })}><option value="DAY">day(s)</option><option value="WEEK">week(s)</option><option value="MONTH">month(s)</option></NativeSelect>
            </div>
          </Field>
          <Field label="First due date" htmlFor="s-start"><Input id="s-start" type="date" value={v.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
          <Field label="Create work order" htmlFor="s-lead" hint="Days before each due date"><Input id="s-lead" type="number" min={0} max={30} value={v.leadTimeDays} onChange={(e) => set({ leadTimeDays: Number(e.target.value) })} /></Field>
          <Field label="Priority" htmlFor="s-pri"><NativeSelect id="s-pri" value={v.priority} onChange={(e) => set({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</NativeSelect></Field>
          <Field label="Checklist" htmlFor="s-cl" optional><NativeSelect id="s-cl" value={v.checklistTemplateId} onChange={(e) => set({ checklistTemplateId: e.target.value })}><option value="">Category default</option>{(checklists.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
          <Field label="Assign to" htmlFor="s-tech" optional><NativeSelect id="s-tech" value={v.defaultAssigneeId} onChange={(e) => set({ defaultAssigneeId: e.target.value })}><option value="">Leave for triage</option>{(techs.data?.data ?? []).map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}</NativeSelect></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
