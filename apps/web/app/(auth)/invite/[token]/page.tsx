'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { ROLE_LABELS, passwordSchema, personNameSchema, type MeResponse, type Role } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { landingFor } from '@/lib/routing';
import { useMe } from '@/lib/session';

interface Lookup {
  organizationName: string;
  email: string;
  role: Role;
  inviterName: string | null;
  accountExists: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
}

const newAccount = z.object({ name: personNameSchema, password: passwordSchema });

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [error, setError] = useState<string | null>(null);
  const lookup = useQuery({ queryKey: ['invite', token], queryFn: () => api<Lookup>('/invitations/lookup', { query: { token } }), retry: false });
  const form = useZodForm(newAccount, { defaultValues: { name: '', password: '' } });

  const accept = useMutation({
    mutationFn: (body: { name?: string; password?: string }) => api<MeResponse>('/invitations/accept', { method: 'POST', body: { token, ...body } }),
    onSuccess: (data) => {
      qc.setQueryData(qk.me, data);
      router.replace(landingFor(data));
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (lookup.isLoading) return <Skeleton className="h-64 w-full" />;
  if (lookup.isError || !lookup.data) {
    return (
      <Alert tone="danger" title="Invitation not found">
        This invitation link is invalid or was revoked. Ask your administrator for a new one.
      </Alert>
    );
  }
  const inv = lookup.data;
  const signedInAs = me.data?.user.email;

  return (
    <>
      <div className="mb-6 grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
        <Building2 className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold">Join {inv.organizationName}</h1>
      <p className="mt-1.5 text-sm text-ink-3">
        {inv.inviterName ? `${inv.inviterName} invited` : 'You were invited'} <span className="font-medium text-ink">{inv.email}</span> to join as{' '}
        <span className="font-medium text-ink">{ROLE_LABELS[inv.role].toLowerCase()}</span>.
      </p>

      {inv.status !== 'PENDING' ? (
        <Alert tone="warning" className="mt-6" title={inv.status === 'EXPIRED' ? 'This invitation has expired' : 'Already accepted'}>
          {inv.status === 'EXPIRED' ? 'Ask an administrator to send a new invitation.' : <Link href="/sign-in" className="underline">Sign in to continue</Link>}
        </Alert>
      ) : (
        <>
          {error && (
            <Alert tone="danger" className="mt-6">
              {error}
            </Alert>
          )}
          {signedInAs ? (
            signedInAs === inv.email ? (
              <Button size="lg" className="mt-6 w-full" loading={accept.isPending} onClick={() => accept.mutate({})}>
                Accept invitation
              </Button>
            ) : (
              <Alert tone="warning" className="mt-6" title={`You're signed in as ${signedInAs}`}>
                This invitation is for {inv.email}. Sign out and sign in with that account to accept it.
              </Alert>
            )
          ) : inv.accountExists ? (
            <div className="mt-6 grid gap-3">
              <Alert tone="info">
                <span className="inline-flex items-center gap-1.5">
                  <CircleAlert className="size-4" /> You already have a FixFlow account. Sign in to accept.
                </span>
              </Alert>
              <Button asChild size="lg">
                <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
              </Button>
            </div>
          ) : (
            <form className="mt-6 grid gap-4" noValidate onSubmit={form.handleSubmit((v) => accept.mutate(v))}>
              <Field label="Full name" htmlFor="name" error={form.formState.errors.name?.message}>
                <Input id="name" autoComplete="name" autoFocus aria-invalid={!!form.formState.errors.name} aria-describedby={describedBy('name', form.formState.errors.name?.message)} {...form.register('name')} />
              </Field>
              <Field label="Choose a password" htmlFor="password" error={form.formState.errors.password?.message} hint="At least 10 characters.">
                <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
              </Field>
              <Button type="submit" size="lg" loading={accept.isPending} className="w-full">
                Create account & join
              </Button>
            </form>
          )}
        </>
      )}
    </>
  );
}
