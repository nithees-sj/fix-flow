'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { changePasswordSchema, updateProfileSchema, type MeResponse } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { useMe } from '@/lib/session';

interface SessionRow { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string; current: boolean }

function device(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const mobile = /Mobile|Android|iPhone/i.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: `${browser}${os ? ` on ${os}` : ''}`, mobile };
}

export default function ProfileSettings() {
  const qc = useQueryClient();
  const me = useMe();
  const [pwError, setPwError] = useState<string | null>(null);
  const profile = useZodForm(updateProfileSchema, { values: { name: me.data?.user.name ?? '', phone: me.data?.user.phone ?? '' } });
  const pw = useZodForm(changePasswordSchema, { defaultValues: { currentPassword: '', newPassword: '' } });
  const sessions = useQuery({ queryKey: qk.sessions, queryFn: () => api<SessionRow[]>('/profile/sessions') });

  const saveProfile = useMutation({
    mutationFn: (v: object) => api<MeResponse>('/profile', { method: 'PATCH', body: v }),
    onSuccess: (data) => { qc.setQueryData(qk.me, data); toast.success('Profile saved'); },
    onError: (e) => applyServerErrors(profile, e),
  });
  const changePw = useMutation({
    mutationFn: (v: object) => api('/profile/password', { method: 'POST', body: v }),
    onSuccess: () => { pw.reset(); setPwError(null); toast.success('Password changed', { description: 'Other devices were signed out.' }); void qc.invalidateQueries({ queryKey: qk.sessions }); },
    onError: (e) => setPwError(applyServerErrors(pw, e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/profile/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Session signed out'); void qc.invalidateQueries({ queryKey: qk.sessions }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resend = useMutation({ mutationFn: () => api('/auth/resend-verification', { method: 'POST' }), onSuccess: () => toast.success('Verification email sent') });

  return (
    <>
      <SettingsSection
        title="Profile"
        description="Your name is shown on work orders, comments and the activity timeline."
        footer={<Button loading={saveProfile.isPending} onClick={profile.handleSubmit((v) => saveProfile.mutate(v))}>Save profile</Button>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="p-name" error={profile.formState.errors.name?.message}>
            <Input id="p-name" aria-invalid={!!profile.formState.errors.name} aria-describedby={describedBy('p-name', profile.formState.errors.name?.message)} {...profile.register('name')} />
          </Field>
          <Field label="Phone" htmlFor="p-phone" optional error={profile.formState.errors.phone?.message}>
            <Input id="p-phone" type="tel" {...profile.register('phone')} />
          </Field>
          <Field label="Email" htmlFor="p-email" hint={me.data?.user.emailVerified ? undefined : 'Not verified yet'}>
            <div className="flex items-center gap-2">
              <Input id="p-email" value={me.data?.user.email ?? ''} disabled />
              {me.data && (me.data.user.emailVerified ? <Badge tone="green">Verified</Badge> : <Button variant="secondary" size="sm" onClick={() => resend.mutate()} loading={resend.isPending}>Verify</Button>)}
            </div>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="Use at least 10 characters. Changing it signs out your other devices."
        footer={<Button loading={changePw.isPending} onClick={pw.handleSubmit((v) => changePw.mutate(v))}>Change password</Button>}
      >
        {pwError && <Alert tone="danger" className="mb-4">{pwError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" htmlFor="pw-cur" error={pw.formState.errors.currentPassword?.message}>
            <Input id="pw-cur" type="password" autoComplete="current-password" {...pw.register('currentPassword')} />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={pw.formState.errors.newPassword?.message}>
            <Input id="pw-new" type="password" autoComplete="new-password" {...pw.register('newPassword')} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title="Active sessions" description="Devices signed in to your account. Sign out any you don’t recognize.">
        <ul className="divide-y divide-line-subtle">
          {(sessions.data ?? []).map((s) => {
            const d = device(s.userAgent);
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface-muted text-ink-3">{d.mobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm text-ink">{d.label}{s.current && <Badge tone="green">This device</Badge>}</span>
                  <span className="text-xs text-ink-3">{s.ip ?? 'Unknown IP'} · active {timeAgo(s.lastUsedAt)}</span>
                </span>
                {!s.current && <Button variant="ghost" size="xs" onClick={() => revoke.mutate(s.id)}><LogOut /> Sign out</Button>}
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </>
  );
}
