'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CATEGORY_COLORS, CATEGORY_ICONS, type CategoryDto, type ChecklistTemplateDto } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { CATEGORY_ICON_MAP, CategoryChip } from '@/components/work-orders/badges';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { CATEGORY_CHIP } from '@/lib/tone';
import { cn } from '@/lib/utils';

export default function CategorySettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CategoryDto | 'new' | null>(null);
  const q = useQuery({ queryKey: [...qk.categories, 'all'], queryFn: () => api<CategoryDto[]>('/categories', { query: { includeArchived: 'true' } }) });
  const toggle = useMutation({
    mutationFn: (c: CategoryDto) => api(`/categories/${c.id}/${c.archived ? 'restore' : 'archive'}`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsSection
      title="Maintenance categories"
      description="Categories route work to skilled technicians and pick the default checklist. Archived categories stay on historical work orders."
      footer={<Button size="sm" onClick={() => setEditing('new')}><Plus /> Add category</Button>}
    >
      <ul className="divide-y divide-line-subtle">
        {(q.data ?? []).map((c) => (
          <li key={c.id} className={cn('flex items-center gap-3 py-2.5', c.archived && 'opacity-60')}>
            <CategoryChip category={c} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{c.description}</span>
            <span className="hidden text-xs text-ink-3 sm:inline tabular">{c.workOrderCount} work orders</span>
            {c.archived && <Badge>Archived</Badge>}
            <Button variant="ghost" size="icon-xs" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil /></Button>
            <Button variant="ghost" size="icon-xs" aria-label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`} onClick={() => toggle.mutate(c)}>{c.archived ? <RotateCcw /> : <Archive />}</Button>
          </li>
        ))}
      </ul>
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SettingsSection>
  );
}

function CategoryDialog({ category, onClose }: { category: CategoryDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: qk.checklists, queryFn: () => api<ChecklistTemplateDto[]>('/checklist-templates') });
  const [v, setV] = useState({ name: category?.name ?? '', description: category?.description ?? '', color: category?.color ?? 'blue', icon: category?.icon ?? 'wrench', defaultChecklistTemplateId: category?.defaultChecklistTemplateId ?? '' });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, defaultChecklistTemplateId: v.defaultChecklistTemplateId || null };
      return category ? api(`/categories/${category.id}`, { method: 'PATCH', body }) : api('/categories', { method: 'POST', body });
    },
    onSuccess: () => { toast.success('Category saved'); void qc.invalidateQueries({ queryKey: qk.categories }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const Icon = CATEGORY_ICON_MAP[v.icon];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={category ? `Edit ${category.name}` : 'New category'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={v.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        <div className="grid gap-4">
          <div className="flex items-center gap-3">
            <span className={cn('grid size-10 place-items-center rounded-lg', CATEGORY_CHIP[v.color])}>{Icon && <Icon className="size-5" />}</span>
            <Field label="Name" htmlFor="c-name" className="flex-1"><Input id="c-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          </div>
          <Field label="Description" htmlFor="c-desc" optional><Input id="c-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Color</legend>
            <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} onClick={() => setV({ ...v, color: c })} className={cn('size-8 rounded-lg ring-offset-2 ring-offset-surface', CATEGORY_CHIP[c], v.color === c && 'ring-2 ring-brand')} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Icon</legend>
            <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
              {CATEGORY_ICONS.map((i) => {
                const I = CATEGORY_ICON_MAP[i]!;
                return (
                  <button key={i} type="button" role="radio" aria-checked={v.icon === i} aria-label={i} onClick={() => setV({ ...v, icon: i })} className={cn('grid size-9 place-items-center rounded-lg border text-ink-3 hover:text-ink', v.icon === i ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line')}>
                    <I className="size-4" />
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Default checklist" htmlFor="c-cl" optional hint="Copied onto every new work order in this category.">
            <NativeSelect id="c-cl" value={v.defaultChecklistTemplateId} onChange={(e) => setV({ ...v, defaultChecklistTemplateId: e.target.value })}>
              <option value="">None</option>
              {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
