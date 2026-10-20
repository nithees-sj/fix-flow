'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, type OrganizationDto, type OrganizationPolicy, type Permission } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Switch } from '@/components/ui/controls';
import { Skeleton } from '@/components/ui/display';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-client';

const GROUPS: { label: string; items: [Permission, string][] }[] = [
  { label: 'Work orders', items: [['workOrder.create', 'Report issues'], ['workOrder.readAssigned', 'Work assigned jobs'], ['workOrder.readAll', 'See all work orders'], ['workOrder.assign', 'Assign technicians'], ['workOrder.update', 'Edit priority & details'], ['workOrder.verify', 'Verify any repair'], ['workOrder.internalNotes', 'Internal notes']] },
  { label: 'Operations', items: [['asset.manage', 'Manage assets'], ['location.manage', 'Manage locations'], ['schedule.manage', 'Manage maintenance schedules'], ['checklist.manage', 'Manage checklists'], ['sla.manage', 'Manage SLA targets']] },
  { label: 'People & insight', items: [['team.read', 'View team & workload'], ['team.manageSkills', 'Edit skills & availability'], ['team.manage', 'Change roles / suspend'], ['invitation.manage', 'Invite people'], ['analytics.read', 'Analytics'], ['report.export', 'Export reports']] },
  { label: 'Administration', items: [['org.settings', 'Organization settings'], ['category.manage', 'Manage categories'], ['audit.read', 'Audit log']] },
];

type BoolKey = 'requesterCanVerify' | 'technicianSelfAssign' | 'requesterSeesAllOrgRequests' | 'requireEvidencePhoto';
const TOGGLES: { key: BoolKey; label: string; description: string }[] = [
  { key: 'requesterCanVerify', label: 'Requesters verify their own repairs', description: 'Otherwise only managers approve submitted work.' },
  { key: 'requireEvidencePhoto', label: 'Require a photo before submitting', description: 'Technicians must attach at least one image as resolution evidence.' },
  { key: 'technicianSelfAssign', label: 'Technicians can pick up open work', description: 'Shows the open pool to technicians with an “Assign to me” action.' },
  { key: 'requesterSeesAllOrgRequests', label: 'Requesters see all requests', description: 'Useful for small teams; by default requesters only see their own.' },
];

export default function PermissionsSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.org, queryFn: () => api<OrganizationDto>('/organizations/current') });
  const save = useMutation({
    mutationFn: (patch: Partial<OrganizationPolicy>) => api<OrganizationDto>('/organizations/current/policy', { method: 'PATCH', body: patch }),
    onSuccess: (o) => { qc.setQueryData(qk.org, o); toast.success('Policy updated'); },
    onError: (e) => { toast.error(errorMessage(e)); void q.refetch(); },
  });
  const p = q.data?.policy;
  return (
    <>
      <SettingsSection title="Workflow policy" description="These rules are enforced by the server for every request.">
        {!p ? <Skeleton className="h-40" /> : (
          <div className="divide-y divide-line-subtle">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <span><span className="block text-sm font-medium text-ink">{t.label}</span><span className="block text-xs text-ink-3">{t.description}</span></span>
                <Switch checked={p[t.key]} onCheckedChange={(v) => save.mutate({ [t.key]: v })} aria-label={t.label} />
              </label>
            ))}
            <div className="grid gap-4 py-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">Assignment automation
                <NativeSelect value={p.autoAssignMode} onChange={(e) => save.mutate({ autoAssignMode: e.target.value as OrganizationPolicy['autoAssignMode'] })}>
                  <option value="OFF">Off — managers assign manually</option>
                  <option value="SUGGEST">Suggest — ranked recommendations</option>
                  <option value="AUTO">Auto — assign the best skilled match</option>
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">QR label reporting
                <NativeSelect value={p.qrReportingMode} onChange={(e) => save.mutate({ qrReportingMode: e.target.value as OrganizationPolicy['qrReportingMode'] })}>
                  <option value="AUTHENTICATED">Members only (sign-in required)</option>
                  <option value="PUBLIC">Anyone — guests leave name & contact</option>
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">Reopen window (days)
                <Input type="number" min={0} max={90} defaultValue={p.reopenWindowDays} onBlur={(e) => Number(e.target.value) !== p.reopenWindowDays && save.mutate({ reopenWindowDays: Number(e.target.value) })} />
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">Auto-close resolved work after (days)
                <Input type="number" min={1} max={90} defaultValue={p.autoCloseDays} onBlur={(e) => Number(e.target.value) !== p.autoCloseDays && save.mutate({ autoCloseDays: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Roles" description="Each person has one role per organization. Role capabilities are fixed so access stays predictable and auditable.">
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2.5">
              <p className="text-sm font-medium text-ink">{ROLE_LABELS[r]}</p>
              <p className="text-xs text-ink-3">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <caption className="sr-only">Permissions by role</caption>
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th scope="col" className="pb-2 font-medium">Capability</th>
                {ROLES.slice().reverse().map((r) => <th key={r} scope="col" className="pb-2 text-center font-medium">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            {GROUPS.map((g) => (
              <tbody key={g.label}>
                <tr><th colSpan={5} scope="colgroup" className="pb-1 pt-4 text-left text-[11px] font-medium uppercase tracking-wider text-ink-4">{g.label}</th></tr>
                {g.items.map(([perm, label]) => (
                  <tr key={perm} className="border-t border-line-subtle">
                    <th scope="row" className="py-2 text-left font-normal text-ink-2">{label}</th>
                    {ROLES.slice().reverse().map((r) => (
                      <td key={r} className="text-center">
                        {ROLE_PERMISSIONS[r].has(perm) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-ink-4" aria-label="Not allowed" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </SettingsSection>
    </>
  );
}
