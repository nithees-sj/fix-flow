'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { PRIORITY_META, formatMinutes, type SlaPolicyDto } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Skeleton } from '@/components/ui/display';
import { Input, Textarea } from '@/components/ui/input';
import { PriorityBadge } from '@/components/work-orders/badges';
import { api, errorMessage, isApiError } from '@/lib/api';
import { useSlaPolicies } from '@/lib/queries';
import { qk } from '@/lib/query-client';

export default function SlaSettings() {
  const qc = useQueryClient();
  const q = useSlaPolicies();
  // Unsaved edits layered over the server copy; null = no local changes.
  const [edits, setEdits] = useState<SlaPolicyDto[] | null>(null);
  const draft = edits ?? q.data ?? null;
  const save = useMutation({
    mutationFn: () => api<SlaPolicyDto[]>('/sla-policies', { method: 'PUT', body: { policies: draft } }),
    onSuccess: (d) => { qc.setQueryData(qk.slaPolicies, d); setEdits(null); toast.success('Service levels saved', { description: 'New targets apply to new, re-prioritized and reopened work orders.' }); },
    onError: (e) => toast.error(isApiError(e) && e.problem.errors?.[0] ? e.problem.errors[0].message : errorMessage(e)),
  });
  const set = (i: number, patch: Partial<SlaPolicyDto>) => setEdits((d) => (d ?? q.data ?? []).map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const dirty = edits !== null && JSON.stringify(edits) !== JSON.stringify(q.data);

  return (
    <SettingsSection
      title="Priorities & service levels"
      description="Response = until a technician starts work. Resolution = until the approved repair was submitted. Deadlines are fixed on each work order when it is created."
      footer={<Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save service levels</Button>}
    >
      {!draft ? <Skeleton className="h-64" /> : (
        <div className="grid gap-3">
          {draft.map((p, i) => (
            <div key={p.priority} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PriorityBadge priority={p.priority} />
                <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                  Escalate breaches to managers
                  <Switch checked={p.escalationEnabled} onCheckedChange={(v) => set(i, { escalationEnabled: v })} aria-label={`${PRIORITY_META[p.priority].label} escalation`} />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-ink-3">Respond within (hours)
                  <Input type="number" min={0.25} step={0.25} value={+(p.responseMinutes / 60).toFixed(2)} onChange={(e) => set(i, { responseMinutes: Math.round(Number(e.target.value) * 60) })} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-3">Resolve within (hours)
                  <Input type="number" min={0.5} step={0.5} value={+(p.resolutionMinutes / 60).toFixed(2)} onChange={(e) => set(i, { resolutionMinutes: Math.round(Number(e.target.value) * 60) })} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-3">Warn at (% of window)
                  <Input type="number" min={50} max={95} value={p.warningPercent} onChange={(e) => set(i, { warningPercent: Number(e.target.value) })} />
                </label>
              </div>
              <label className="mt-3 grid gap-1 text-xs font-medium text-ink-3">Guidance shown to requesters
                <Textarea rows={2} value={p.description} maxLength={240} onChange={(e) => set(i, { description: e.target.value })} />
              </label>
              <p className="mt-2 text-xs text-ink-4">Currently: respond in {formatMinutes(p.responseMinutes)}, resolve in {formatMinutes(p.resolutionMinutes)}.</p>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
