'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { registerSchema, type MeResponse } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyServerErrors, useZodForm } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { cn } from '@/lib/utils';

export default function SignUpPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(registerSchema, { defaultValues: { name: '', email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;
  const password = form.watch('password') ?? '';

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const me = await api<MeResponse>('/auth/register', { method: 'POST', body: values });
      qc.setQueryData(qk.me, me);
      router.replace('/onboarding');
    } catch (e) {
      setFormError(applyServerErrors(form, e));
    }
  });

  return (
    <>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1.5 text-sm text-ink-3">Set up FixFlow for your organization in a few minutes.</p>
      {formError && (
        <Alert tone="danger" className="mt-6">
          {formError}
        </Alert>
      )}
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" autoFocus aria-invalid={!!errors.name} aria-describedby={describedBy('name', errors.name?.message)} {...form.register('name')} />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={describedBy('email', errors.email?.message)} {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="password-rules" {...form.register('password')} />
          <ul id="password-rules" className="mt-1 grid gap-1 text-xs">
            <Rule ok={password.length >= 10}>At least 10 characters</Rule>
            <Rule ok={/[a-z]/i.test(password) && /\d|[^a-z]/i.test(password)}>Mix letters with numbers or symbols</Rule>
          </ul>
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
          Create account
        </Button>
        <p className="text-center text-xs text-ink-3">We’ll email you a link to confirm your address.</p>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-brand-ink hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5', ok ? 'text-success-ink' : 'text-ink-3')}>
      <span className={cn('grid size-3.5 place-items-center rounded-full', ok ? 'bg-success text-white' : 'border border-line-strong')}>{ok && <Check className="size-2.5" strokeWidth={3} />}</span>
      {children}
    </li>
  );
}
