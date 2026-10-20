'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { INDUSTRIES, INDUSTRY_LABELS, type OrganizationDto } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/query-client';

function zones(current: string): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    return [...new Set([current, 'UTC', ...all])];
  } catch {
    return [current, 'UTC'];
  }
}

export default function OrganizationSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.org, queryFn: () => api<OrganizationDto>('/organizations/current') });
  const [v, setV] = useState({ name: '', industry: 'OTHER', timezone: 'UTC' });
  const [tz, setTz] = useState<string[]>([]);
  useEffect(() => {
    if (q.data) {
      setV({ name: q.data.name, industry: q.data.industry, timezone: q.data.timezone });
      setTz(zones(q.data.timezone));
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<OrganizationDto>('/organizations/current', { method: 'PATCH', body: v }),
    onSuccess: (o) => { qc.setQueryData(qk.org, o); void qc.invalidateQueries({ queryKey: qk.me }); toast.success('Organization updated'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsSection
      title="Organization profile"
      description={q.data ? `Workspace created ${formatDate(q.data.createdAt)} · URL key “${q.data.slug}”` : undefined}
      footer={<Button loading={save.isPending} disabled={!q.data || v.name.trim().length < 2} onClick={() => save.mutate()}>Save changes</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" htmlFor="o-name" className="sm:col-span-2"><Input id="o-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Industry" htmlFor="o-ind"><NativeSelect id="o-ind" value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })}>{INDUSTRIES.map((i) => <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>)}</NativeSelect></Field>
        <Field label="Time zone" htmlFor="o-tz" hint="Drives report buckets and maintenance schedule times."><NativeSelect id="o-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>{tz.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</NativeSelect></Field>
      </div>
    </SettingsSection>
  );
}
