'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Boxes, CheckCircle2, LogIn, MapPin, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicReportContext } from '@fixflow/shared';
import { Logo } from '@/components/brand';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { CATEGORY_ICON_MAP } from '@/components/work-orders/badges';
import { api, errorMessage, isApiError } from '@/lib/api';
import { useMe } from '@/lib/session';
import { CATEGORY_CHIP } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Landing page of a printed QR label. The API returns only the organization's display name,
 * what the label is attached to, and the category list — nothing else.
 */
export default function QrReportPage() {
  const { token } = useParams<{ token: string }>();
  const me = useMe();
  const ctx = useQuery({ queryKey: ['public-report', token], queryFn: () => api<PublicReportContext>(`/public/report/${token}`), retry: false });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (ctx.data?.defaultCategoryId && !categoryId) setCategoryId(ctx.data.defaultCategoryId);
  }, [ctx.data, categoryId]);

  const signedIn = !!me.data;
  const submit = useMutation({
    mutationFn: () =>
      api<{ reference: string; workOrderNumber: number; trackable: boolean }>(`/public/report/${token}`, {
        method: 'POST',
        body: { title, description, categoryId: categoryId ?? undefined, ...(signedIn ? {} : { guestName, guestContact }), ...(website ? { website } : {}) },
      }),
    onError: (e) => setError(errorMessage(e)),
  });

  if (ctx.isLoading) return <Shell><Skeleton className="h-80" /></Shell>;
  if (ctx.isError || !ctx.data) {
    return (
      <Shell>
        <Alert tone="danger" title="This label is no longer active">
          The QR code may have been replaced. {isApiError(ctx.error) && ctx.error.status === 404 ? 'Look for a newer label nearby or report the issue another way.' : 'Please try again.'}
        </Alert>
      </Shell>
    );
  }
  const c = ctx.data;
  const mustSignIn = c.qrReportingMode === 'AUTHENTICATED' && !signedIn;

  if (submit.data) {
    return (
      <Shell>
        <Card className="p-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-success-soft text-success"><CheckCircle2 className="size-6" /></span>
          <h1 className="mt-4 text-xl font-semibold">Thanks — it’s reported</h1>
          <p className="mt-1.5 text-sm text-ink-3">Reference <span className="font-mono font-medium text-ink">{submit.data.reference}</span>. The {c.organizationName} maintenance team has been notified.</p>
          {submit.data.trackable && (
            <Button asChild className="mt-5 w-full"><Link href={`/work-orders/${submit.data.workOrderNumber}`}>Track this request</Link></Button>
          )}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-[13px] font-medium text-brand-ink">{c.organizationName}</p>
      <h1 className="mt-1 text-2xl font-semibold">Report an issue</h1>
      <Card className="mt-4 flex items-center gap-3 px-4 py-3">
        <span className="grid size-10 place-items-center rounded-lg bg-surface-muted text-ink-3">{c.target.kind === 'asset' ? <Boxes className="size-5" /> : <MapPin className="size-5" />}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{c.target.name}</p>
          <p className="truncate text-xs text-ink-3">{c.target.kind === 'asset' ? `${c.target.assetTag} · ${c.target.locationName}` : c.target.path}</p>
        </div>
      </Card>

      {mustSignIn ? (
        <Card className="mt-4 p-5 text-center">
          <p className="text-sm text-ink-2">Sign in with your {c.organizationName} account to report an issue here.</p>
          <Button asChild className="mt-4 w-full"><Link href={`/sign-in?next=${encodeURIComponent(`/r/${token}`)}`}><LogIn /> Sign in to report</Link></Button>
        </Card>
      ) : (
        <form className="mt-4 grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="What’s wrong?" htmlFor="r-title">
            <Input id="r-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Not cooling, making noise, leaking" maxLength={140} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-2">Type of problem</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {c.categories.map((cat) => {
                const I = CATEGORY_ICON_MAP[cat.icon];
                const on = categoryId === cat.id;
                return (
                  <button key={cat.id} type="button" role="radio" aria-checked={on} onClick={() => setCategoryId(cat.id)} className={cn('flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-[13px] font-medium', on ? 'border-brand bg-brand-soft/60 ring-1 ring-brand/30' : 'border-line bg-surface')}>
                    <span className={cn('grid size-7 place-items-center rounded-md', CATEGORY_CHIP[cat.color])}>{I && <I className="size-4" />}</span>
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Details" htmlFor="r-desc" optional>
            <Textarea id="r-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </Field>
          {!signedIn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="r-name"><Input id="r-name" autoComplete="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} /></Field>
              <Field label="Email or phone" htmlFor="r-contact" hint="Only used to follow up on this report."><Input id="r-contact" value={guestContact} onChange={(e) => setGuestContact(e.target.value)} /></Field>
            </div>
          )}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>
          <Button type="submit" size="lg" loading={submit.isPending} disabled={title.trim().length < 3 || !categoryId}><Send /> Send report</Button>
          {signedIn && <p className="text-center text-xs text-ink-3">Reporting as {me.data?.user.name}</p>}
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-14 items-center px-5"><Logo size="sm" /></header>
      <main id="main" className="mx-auto max-w-md px-5 pb-12 pt-2">{children}</main>
    </div>
  );
}
