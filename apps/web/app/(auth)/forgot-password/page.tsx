'use client';

import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { forgotPasswordSchema } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/forms';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: values });
      setSentTo(values.email);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
          <MailCheck className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Check your inbox</h1>
        <p className="mt-2 text-sm text-ink-3">
          If an account exists for <span className="font-medium text-ink">{sentTo}</span>, we’ve sent a link to reset your password. It expires in 30 minutes.
        </p>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Link href="/sign-in" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-1.5 text-sm text-ink-3">Enter your account email and we’ll send you a secure reset link.</p>
      {error && (
        <Alert tone="danger" className="mt-6">
          {error}
        </Alert>
      )}
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} aria-describedby={describedBy('email', errors.email?.message)} {...form.register('email')} />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>
    </>
  );
}
