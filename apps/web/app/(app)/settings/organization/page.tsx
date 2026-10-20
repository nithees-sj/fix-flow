'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { INDUSTRIES, INDUSTRY_LABELS, type OrganizationDto } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';
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
  const q = useQuery({ queryKey: qk.org, queryFn: () => api<OrganizationDto>('/organizations/current') });
  if (!q.data) {
    return (
      <SettingsSection title="Organization profile">
        <Skeleton className="h-36" />
      </SettingsSection>
    );
  }
  return <OrganizationForm key={q.data.id} org={q.data} />;
}

function OrganizationForm({ org }: { org: OrganizationDto }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: org.name, industry: org.industry as string, timezone: org.timezone });
  const tz = useMemo(() => zones(org.timezone), [org.timezone]);
  const save = useMutation({
    mutationFn: () => api<OrganizationDto>('/organizations/current', { method: 'PATCH', body: v }),
    onSuccess: (o) => { qc.setQueryData(qk.org, o); void qc.invalidateQueries({ queryKey: qk.me }); toast.success('Organization updated'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsSection
      title="Organization profile"
      description={`Workspace created ${formatDate(org.createdAt)} · URL key “${org.slug}”`}
      footer={<Button loading={save.isPending} disabled={v.name.trim().length < 2} onClick={() => save.mutate()}>Save changes</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" htmlFor="o-name" className="sm:col-span-2"><Input id="o-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Industry" htmlFor="o-ind"><NativeSelect id="o-ind" value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })}>{INDUSTRIES.map((i) => <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>)}</NativeSelect></Field>
        <Field label="Time zone" htmlFor="o-tz" hint="Drives report buckets and maintenance schedule times."><NativeSelect id="o-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>{tz.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</NativeSelect></Field>
      </div>
    </SettingsSection>
  );
}
