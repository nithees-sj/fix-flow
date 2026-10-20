'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { z } from 'zod';
import { passwordSchema } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/forms';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(schema, { defaultValues: { password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  if (!token) {
    return (
      <Alert tone="danger" title="Invalid reset link">
        This link is incomplete. <Link href="/forgot-password" className="font-medium underline">Request a new one</Link>.
      </Alert>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: values.password } });
      router.replace('/sign-in?reset=1');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-ink-3">For your security, every other signed-in device will be signed out.</p>
      {error && (
        <Alert tone="danger" className="mt-6">
          {error} <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="New password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters.">
          <Input id="password" type="password" autoComplete="new-password" autoFocus aria-invalid={!!errors.password} aria-describedby={describedBy('password', errors.password?.message, true)} {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} aria-describedby={describedBy('confirm', errors.confirm?.message)} {...form.register('confirm')} />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
