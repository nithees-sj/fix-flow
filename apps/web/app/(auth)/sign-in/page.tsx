'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { loginSchema, type MeResponse } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyServerErrors, useZodForm } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { landingFor, safeNext } from '@/lib/routing';

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const me = await api<MeResponse>('/auth/login', { method: 'POST', body: values });
      qc.setQueryData(qk.me, me);
      const next = safeNext(params.get('next'));
      router.replace(me.activeOrganization && next ? next : landingFor(me));
    } catch (e) {
      setFormError(applyServerErrors(form, e));
    }
  });

  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1.5 text-sm text-ink-3">Sign in to your FixFlow workspace.</p>
      {params.get('reset') === '1' && (
        <Alert tone="success" className="mt-6">
          Your password was changed. Sign in with your new password.
        </Alert>
      )}
      {formError && (
        <Alert tone="danger" className="mt-6">
          {formError}
        </Alert>
      )}
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="Work email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} aria-describedby={describedBy('email', errors.email?.message)} {...form.register('email')} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          action={
            <Link href="/forgot-password" className="text-xs font-medium text-brand-ink hover:underline">
              Forgot password?
            </Link>
          }
        >
          <Input
            id="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={describedBy('password', errors.password?.message)}
            trailing={
              <button type="button" onClick={() => setShow((s) => !s)} className="grid size-7 place-items-center rounded text-ink-4 hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            }
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        New to FixFlow?{' '}
        <Link href="/sign-up" className="font-medium text-brand-ink hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
