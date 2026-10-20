'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token') ?? '';
  const verify = useMutation({ mutationFn: () => api('/auth/verify-email', { method: 'POST', body: { token } }) });
  const { mutate } = verify;
  useEffect(() => {
    if (token) mutate();
  }, [token, mutate]);

  if (!token || verify.isError) {
    return (
      <Result icon={<XCircle className="size-6 text-danger" />} tone="bg-danger-soft" title="Link not valid" body={token ? errorMessage(verify.error) : 'This verification link is incomplete.'} />
    );
  }
  if (verify.isSuccess) {
    return <Result icon={<CheckCircle2 className="size-6 text-success" />} tone="bg-success-soft" title="Email confirmed" body="Thanks — your email address is verified." />;
  }
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-ink-3">
      <Spinner /> Confirming your email…
    </div>
  );
}

function Result({ icon, tone, title, body }: { icon: React.ReactNode; tone: string; title: string; body: string }) {
  return (
    <div className="text-center">
      <div className={`mx-auto grid size-12 place-items-center rounded-xl ${tone}`}>{icon}</div>
      <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-ink-3">{body}</p>
      <Button asChild className="mt-6 w-full">
        <Link href="/dashboard">Continue to FixFlow</Link>
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
