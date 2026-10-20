'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ChecklistTemplateDto } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, EmptyState } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-client';

export default function ChecklistSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ChecklistTemplateDto | 'new' | null>(null);
  const [archiving, setArchiving] = useState<ChecklistTemplateDto | null>(null);
  const q = useQuery({ queryKey: qk.checklists, queryFn: () => api<ChecklistTemplateDto[]>('/checklist-templates') });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/checklist-templates/${id}/archive`, { method: 'POST' }),
    onSuccess: () => { setArchiving(null); toast.success('Checklist archived'); void qc.invalidateQueries({ queryKey: qk.checklists }); void qc.invalidateQueries({ queryKey: qk.categories }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsSection title="Checklist templates" description="Standard steps copied onto work orders. Editing a template never changes work already in progress." footer={<Button size="sm" onClick={() => setEditing('new')}><Plus /> New template</Button>}>
      {q.data?.length === 0 && <EmptyState compact icon={<ListChecks />} title="No checklist templates" />}
      <ul className="grid gap-3">
        {(q.data ?? []).map((t) => (
          <li key={t.id} className="rounded-lg border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t.name}</p>
                {t.description && <p className="text-xs text-ink-3">{t.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {t.usedByCategories > 0 && <Badge tone="blue">Default for {t.usedByCategories}</Badge>}
                <Button variant="ghost" size="icon-xs" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil /></Button>
                <Button variant="danger-ghost" size="icon-xs" aria-label={`Archive ${t.name}`} onClick={() => setArchiving(t)}><Trash2 /></Button>
              </div>
            </div>
            <ol className="mt-3 grid gap-1 text-[13px] text-ink-2">
              {t.items.map((i, n) => <li key={i.id} className="flex gap-2"><span className="w-5 text-ink-4 tabular">{n + 1}.</span><span className="flex-1">{i.label}</span>{i.required && <span className="text-xs text-ink-4">required</span>}</li>)}
            </ol>
          </li>
        ))}
      </ul>
      {editing && <TemplateDialog template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title={`Archive “${archiving?.name}”?`} description="It will no longer be offered for new work orders, and categories using it as a default will have none." confirmLabel="Archive" tone="danger" loading={archive.isPending} onConfirm={() => archiving && archive.mutate(archiving.id)} />
    </SettingsSection>
  );
}

function TemplateDialog({ template, onClose }: { template: ChecklistTemplateDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [items, setItems] = useState(template?.items.map((i) => ({ label: i.label, required: i.required })) ?? [{ label: '', required: true }]);
  const valid = name.trim().length >= 2 && items.length > 0 && items.every((i) => i.label.trim().length >= 2);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), items: items.map((i) => ({ label: i.label.trim(), required: i.required })) };
      return template ? api(`/checklist-templates/${template.id}`, { method: 'PATCH', body }) : api('/checklist-templates', { method: 'POST', body });
    },
    onSuccess: () => { toast.success('Checklist saved'); void qc.invalidateQueries({ queryKey: qk.checklists }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const move = (i: number, d: -1 | 1) => setItems((xs) => { const n = [...xs]; const j = i + d; if (j < 0 || j >= n.length) return xs; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={template ? 'Edit checklist' : 'New checklist'} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Save checklist</Button></>}>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="t-name"><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Generator monthly test" /></Field>
            <Field label="Description" htmlFor="t-desc" optional><Input id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Steps</p>
            <ol className="grid gap-2">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-ink-4 tabular">{i + 1}.</span>
                  <Input value={it.label} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Step ${i + 1}`} placeholder="Describe the step" />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3"><Checkbox checked={it.required} onCheckedChange={(c) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, required: c === true } : x)))} /> Required</label>
                  <Button variant="ghost" size="icon-xs" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Remove step" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} disabled={items.length === 1}><Trash2 /></Button>
                </li>
              ))}
            </ol>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setItems((xs) => [...xs, { label: '', required: true }])} disabled={items.length >= 50}><Plus /> Add step</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
