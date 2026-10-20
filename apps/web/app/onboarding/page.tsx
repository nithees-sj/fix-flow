'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, Gauge, Plus, Trash2, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  INDUSTRIES,
  INDUSTRY_LABELS,
  PRIORITY_META,
  ROLE_LABELS,
  createOrganizationSchema,
  type MeResponse,
  type OrganizationDto,
  type Role,
  type SlaPolicyDto,
} from '@fixflow/shared';
import { Logo } from '@/components/brand';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/display';
import { describedBy, Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { applyServerErrors, useZodForm } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { landingFor } from '@/lib/routing';
import { useMe } from '@/lib/session';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'org', label: 'Organization', icon: Building2 },
  { key: 'sla', label: 'Service levels', icon: Gauge },
  { key: 'place', label: 'First building', icon: Building2 },
  { key: 'team', label: 'Invite team', icon: Users },
] as const;

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const me = useMe();
  const creatingAnother = params.get('new') === '1';
  const [step, setStep] = useState(0);

  // An organization that already exists but hasn't finished onboarding resumes at step 2.
  useEffect(() => {
    const org = me.data?.activeOrganization;
    if (!creatingAnother && org && step === 0) {
      if (org.onboardingCompleted || org.role !== 'ORG_ADMIN') router.replace(landingFor(me.data!));
      else setStep(1);
    }
  }, [me.data, creatingAnother, step, router]);

  const finish = async () => {
    await api<OrganizationDto>('/organizations/current/onboarding/complete', { method: 'POST' });
    const fresh = await api<MeResponse>('/auth/me');
    qc.setQueryData(qk.me, fresh);
    toast.success('Your workspace is ready');
    router.replace('/dashboard');
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Logo />
        {me.data && <p className="text-[13px] text-ink-3">Signed in as {me.data.user.email}</p>}
      </header>
      <main id="main" className="mx-auto max-w-2xl px-5 pb-16 pt-4">
        <ol className="mb-8 flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <span
                aria-current={i === step ? 'step' : undefined}
                className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold', i < step ? 'bg-success text-white' : i === step ? 'bg-brand text-white' : 'border border-line-strong bg-surface text-ink-3')}
              >
                {i < step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('hidden text-[13px] font-medium sm:inline', i === step ? 'text-ink' : 'text-ink-3')}>{s.label}</span>
              {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-success' : 'bg-line')} aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="animate-slide-up" key={step}>
          {step === 0 && <OrgStep onDone={() => setStep(1)} />}
          {step === 1 && <SlaStep onDone={() => setStep(2)} />}
          {step === 2 && <PlaceStep onDone={() => setStep(3)} />}
          {step === 3 && <TeamStep onDone={finish} />}
        </div>
      </main>
    </div>
  );
}

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-3">{description}</p>
    </div>
  );
}

function OrgStep({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Resolved after mount: the server's time zone database/zone must not leak into the markup.
  const [tzList, setTzList] = useState<string[]>(['UTC']);
  const form = useZodForm(createOrganizationSchema, { defaultValues: { name: '', industry: 'EDUCATION', timezone: 'UTC' } });
  const [detectedTz, setDetectedTz] = useState('UTC');
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setDetectedTz(tz);
    setTzList([...new Set([tz, 'UTC', ...zones()])]);
  }, []);
  // Apply the detected zone once its <option> exists (uncontrolled select).
  useEffect(() => {
    if (tzList.length > 1) form.setValue('timezone', detectedTz);
  }, [tzList, detectedTz, form]);
  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <StepHeader title="Create your organization" description="This is the workspace your team, locations and work orders live in." />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      <Card className="p-5">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (v) => {
            setError(null);
            try {
              const res = await api<{ organization: OrganizationDto; me: MeResponse }>('/organizations', { method: 'POST', body: v });
              qc.setQueryData(qk.me, res.me);
              onDone();
            } catch (e) {
              setError(applyServerErrors(form, e));
            }
          })}
        >
          <Field label="Organization name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoFocus placeholder="e.g. Northbridge Institute of Technology" aria-invalid={!!errors.name} aria-describedby={describedBy('name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry" htmlFor="industry">
              <NativeSelect id="industry" {...form.register('industry')}>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Time zone" htmlFor="timezone" hint="Used for SLA reports and maintenance schedules." error={errors.timezone?.message}>
              <NativeSelect id="timezone" {...form.register('timezone')}>
                {tzList.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" loading={isSubmitting}>Continue <ArrowRight /></Button>
          </div>
        </form>
      </Card>
    </>
  );
}

function SlaStep({ onDone }: { onDone: () => void }) {
  const policies = useQuery({ queryKey: qk.slaPolicies, queryFn: () => api<SlaPolicyDto[]>('/sla-policies') });
  const [draft, setDraft] = useState<SlaPolicyDto[] | null>(null);
  useEffect(() => {
    if (policies.data && !draft) setDraft(policies.data);
  }, [policies.data, draft]);
  const save = useMutation({
    mutationFn: () => api('/sla-policies', { method: 'PUT', body: { policies: draft } }),
    onSuccess: onDone,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (i: number, patch: Partial<SlaPolicyDto>) => setDraft((d) => d!.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <>
      <StepHeader title="Set your service levels" description="Targets drive deadlines, warnings and escalations. These are sensible starting points — adjust them to your commitments." />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">SLA targets by priority</caption>
          <thead>
            <tr className="bg-surface-sunken text-left text-xs text-ink-3">
              <th scope="col" className="px-5 py-2.5 font-medium">Priority</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Respond within (hours)</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Resolve within (hours)</th>
            </tr>
          </thead>
          <tbody>
            {(draft ?? []).map((p, i) => (
              <tr key={p.priority} className="border-t border-line-subtle">
                <th scope="row" className="px-5 py-3 text-left font-medium text-ink">
                  {PRIORITY_META[p.priority].label}
                  <span className="block text-xs font-normal text-ink-3">{p.description}</span>
                </th>
                <td className="px-3 py-3">
                  <Input type="number" min={0.25} step={0.25} className="w-28" aria-label={`${PRIORITY_META[p.priority].label} response hours`} value={p.responseMinutes / 60} onChange={(e) => set(i, { responseMinutes: Math.max(5, Math.round(Number(e.target.value) * 60)) })} />
                </td>
                <td className="px-5 py-3">
                  <Input type="number" min={0.5} step={0.5} className="w-28" aria-label={`${PRIORITY_META[p.priority].label} resolution hours`} value={p.resolutionMinutes / 60} onChange={(e) => set(i, { resolutionMinutes: Math.max(10, Math.round(Number(e.target.value) * 60)) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Keep defaults</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!draft}>Save & continue <ArrowRight /></Button>
      </div>
    </>
  );
}

function PlaceStep({ onDone }: { onDone: () => void }) {
  const [building, setBuilding] = useState('');
  const [rooms, setRooms] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const b = await api<{ id: string }>('/locations', { method: 'POST', body: { name: building.trim(), type: 'BUILDING', parentId: null } });
      const names = rooms.split(',').map((r) => r.trim()).filter((r) => r.length > 0).slice(0, 30);
      for (const name of names) await api('/locations', { method: 'POST', body: { name, type: 'ROOM', parentId: b.id } });
    },
    onSuccess: onDone,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <StepHeader title="Add your first building" description="Locations let people report exactly where something is wrong. You can add floors, rooms and QR labels later." />
      <Card className="grid gap-4 p-5">
        <Field label="Building name" htmlFor="building">
          <Input id="building" autoFocus placeholder="e.g. Science Block" value={building} onChange={(e) => setBuilding(e.target.value)} />
        </Field>
        <Field label="Rooms or areas" htmlFor="rooms" optional hint="Separate with commas — e.g. Lecture Hall 101, Chemistry Lab, Server Room">
          <Input id="rooms" placeholder="Lecture Hall 101, Chemistry Lab" value={rooms} onChange={(e) => setRooms(e.target.value)} />
        </Field>
      </Card>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Skip for now</Button>
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={building.trim().length < 1}>Add & continue <ArrowRight /></Button>
      </div>
    </>
  );
}

function TeamStep({ onDone }: { onDone: () => Promise<void> }) {
  const [rows, setRows] = useState<{ email: string; role: Role }[]>([{ email: '', role: 'MANAGER' }, { email: '', role: 'TECHNICIAN' }]);
  const [busy, setBusy] = useState(false);
  const valid = rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()));
  const send = async () => {
    setBusy(true);
    try {
      if (valid.length) {
        const res = await api<{ invited: unknown[]; skipped: { email: string; reason: string }[] }>('/invitations', { method: 'POST', body: { invitations: valid.map((r) => ({ email: r.email.trim(), role: r.role })) } });
        toast.success(`${res.invited.length} invitation${res.invited.length === 1 ? '' : 's'} sent`);
      }
      await onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <StepHeader title="Invite your team" description="Managers triage and assign work, technicians resolve it, requesters report issues. Invitations expire in 7 days." />
      <Card className="grid gap-3 p-5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_150px_auto] items-center gap-2">
            <Input type="email" placeholder="colleague@example.com" aria-label={`Email ${i + 1}`} value={r.email} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
            <NativeSelect aria-label={`Role ${i + 1}`} value={r.role} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)))}>
              {(['MANAGER', 'TECHNICIAN', 'REQUESTER', 'ORG_ADMIN'] as Role[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </NativeSelect>
            <Button variant="ghost" size="icon-sm" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length === 1}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div>
          <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { email: '', role: 'TECHNICIAN' }])} disabled={rows.length >= 10}>
            <Plus /> Add another
          </Button>
        </div>
      </Card>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => void onDone()} disabled={busy}>Skip — I’ll invite later</Button>
        <Button onClick={send} loading={busy}>{valid.length ? `Send ${valid.length} invite${valid.length === 1 ? '' : 's'} & finish` : 'Finish setup'} <Check /></Button>
      </div>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
