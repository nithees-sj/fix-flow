'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, ChevronRight, Info, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Controller } from 'react-hook-form';
import { toast } from 'sonner';
import {
  PRIORITIES,
  PRIORITY_META,
  createWorkOrderSchema,
  formatMinutes,
  formatWorkOrderNumber,
  type AssetSummary,
  type Paginated,
  type WorkOrderDetail,
  type WorkOrderSummary,
} from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Card } from '@/components/ui/display';
import { describedBy, Field, Label } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { CATEGORY_ICON_MAP, PriorityBadge, StatusBadge } from '@/components/work-orders/badges';
import { api, errorMessage, uploadFile } from '@/lib/api';
import { applyServerErrors, useZodForm } from '@/lib/forms';
import { useCategories, useLocations, useSlaPolicies } from '@/lib/queries';
import { CATEGORY_CHIP } from '@/lib/tone';
import { cn, newIdempotencyKey } from '@/lib/utils';

function NewWorkOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const categories = useCategories();
  const locations = useLocations();
  const policies = useSlaPolicies();
  const [photos, setPhotos] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const form = useZodForm(createWorkOrderSchema, {
    defaultValues: {
      title: '',
      description: '',
      priority: 'MEDIUM',
      categoryId: params.get('category') ?? '',
      locationId: params.get('location') ?? null,
      assetId: params.get('asset') ?? null,
      qrToken: params.get('qr') ?? undefined,
    },
  });
  const { errors } = form.formState;
  const locationId = form.watch('locationId');
  const assetId = form.watch('assetId');
  const priority = form.watch('priority') ?? 'MEDIUM';
  const categoryId = form.watch('categoryId');

  const assets = useQuery({
    queryKey: ['assets', 'picker', locationId ?? 'all'],
    queryFn: () => api<Paginated<AssetSummary>>('/assets', { query: { locationId: locationId ?? undefined, pageSize: 100, sort: 'name', order: 'asc' } }),
  });

  // Prefill the location and category from the asset (QR scan / asset page).
  const asset = assets.data?.data.find((a) => a.id === assetId);
  useEffect(() => {
    if (asset) {
      if (!form.getValues('locationId')) form.setValue('locationId', asset.location.id);
      if (!form.getValues('categoryId')) form.setValue('categoryId', asset.category.id);
    }
  }, [asset, form]);

  // Duplicate hint: open requests already reported for the same asset or place.
  const dupes = useQuery({
    queryKey: ['work-orders', 'dupes', assetId, locationId],
    queryFn: () =>
      api<Paginated<WorkOrderSummary>>('/work-orders', {
        query: { ...(assetId ? { assetId } : { locationId: locationId ?? undefined }), status: 'OPEN,ASSIGNED,IN_PROGRESS,ON_HOLD', pageSize: 3, createdFrom: new Date(Date.now() - 14 * 86_400_000).toISOString() },
      }),
    enabled: !!(assetId || locationId),
  });

  const locationOptions = useMemo(
    () =>
      (locations.data ?? [])
        .filter((l) => !l.archived)
        .map((l) => ({ value: l.id, label: l.name, description: l.path.split(' › ').slice(0, -1).join(' › ') || l.type.toLowerCase(), keywords: [l.path, l.code ?? ''] }))
        .sort((a, b) => (a.description + a.label).localeCompare(b.description + b.label)),
    [locations.data],
  );
  const assetOptions = (assets.data?.data ?? []).map((a) => ({ value: a.id, label: a.name, description: `${a.assetTag} · ${a.location.name}`, keywords: [a.assetTag] }));

  const create = useMutation({
    mutationFn: async (values: Parameters<Parameters<typeof form.handleSubmit>[0]>[0]) => {
      const wo = await api<WorkOrderDetail>('/work-orders', { method: 'POST', body: values, idempotencyKey });
      for (const f of photos) {
        try {
          await uploadFile(`/work-orders/${wo.id}/attachments?kind=REPORT`, f, f.name, undefined, newIdempotencyKey());
        } catch (e) {
          toast.error(`Could not upload ${f.name}: ${errorMessage(e)}`);
        }
      }
      return wo;
    },
    onSuccess: (wo) => {
      toast.success(`${formatWorkOrderNumber(wo.number)} created`, { description: 'The maintenance team has been notified.' });
      router.replace(`/work-orders/${wo.number}`);
    },
    onError: (e) => setFormError(applyServerErrors(form, e)),
  });

  const sla = policies.data?.find((p) => p.priority === priority);

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-ink-3">
        <Link href="/work-orders" className="hover:text-ink">Work orders</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-2">New</span>
      </nav>
      <h1 className="text-[22px] font-semibold">Report an issue</h1>
      <p className="mt-1 text-sm text-ink-3">Tell us what’s wrong and where. A clear title and location get it fixed faster.</p>

      {params.get('qr') && (
        <Alert tone="info" className="mt-5">Location prefilled from the QR label you scanned.</Alert>
      )}
      {formError && <Alert tone="danger" className="mt-5">{formError}</Alert>}

      <form onSubmit={form.handleSubmit((v) => { setFormError(null); create.mutate(v); })} className="mt-6 grid gap-5" noValidate>
        <Card className="grid gap-5 p-5">
          <Field label="What’s the problem?" htmlFor="title" error={errors.title?.message}>
            <Input id="title" autoFocus placeholder="e.g. AC not cooling in Lecture Hall 204" aria-invalid={!!errors.title} aria-describedby={describedBy('title', errors.title?.message)} {...form.register('title')} />
          </Field>
          <Field label="Details" htmlFor="description" optional hint="When did it start? Is it getting worse? Any safety risk?">
            <Textarea id="description" rows={4} placeholder="Describe what you see, hear or smell…" {...form.register('description')} />
          </Field>

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-2">Category</legend>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(categories.data ?? []).map((c) => {
                    const I = CATEGORY_ICON_MAP[c.icon];
                    const on = field.value === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => field.onChange(c.id)}
                        className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-all', on ? 'border-brand bg-brand-soft/60 text-ink ring-1 ring-brand/30' : 'border-line text-ink-2 hover:border-line-strong hover:bg-surface-sunken')}
                      >
                        <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', CATEGORY_CHIP[c.color])}>{I && <I className="size-4" />}</span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.categoryId && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-ink">Choose a category</p>}
          </fieldset>
        </Card>

        <Card className="grid gap-5 p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Location" htmlFor="location" error={errors.locationId?.message}>
              <Controller
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <Combobox id="location" value={field.value} onChange={(v) => { field.onChange(v); if (v !== locationId) form.setValue('assetId', null); }} options={locationOptions} placeholder="Building, floor or room" searchPlaceholder="Search locations…" invalid={!!errors.locationId} clearable />
                )}
              />
            </Field>
            <Field label="Equipment" htmlFor="asset" optional hint={locationId ? 'Assets in the selected location' : 'Pick a location to narrow the list'}>
              <Controller
                control={form.control}
                name="assetId"
                render={({ field }) => (
                  <Combobox id="asset" value={field.value} onChange={field.onChange} options={assetOptions} placeholder="e.g. Split AC unit" searchPlaceholder="Search by name or tag…" empty="No assets here" clearable />
                )}
              />
            </Field>
          </div>
          {dupes.data && dupes.data.data.length > 0 && (
            <Alert tone="warning" title="Already reported?">
              <p className="mb-1.5">There {dupes.data.meta.total === 1 ? 'is an open request' : `are ${dupes.data.meta.total} open requests`} here from the last 14 days:</p>
              <ul className="grid gap-1">
                {dupes.data.data.map((d) => (
                  <li key={d.id}>
                    <Link href={`/work-orders/${d.number}`} className="inline-flex items-center gap-2 font-medium underline-offset-2 hover:underline">
                      {formatWorkOrderNumber(d.number)} · {d.title} <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-2">Urgency</legend>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <div role="radiogroup" aria-label="Priority" className="grid gap-2 sm:grid-cols-4">
                  {PRIORITIES.map((p) => {
                    const on = field.value === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => field.onChange(p)}
                        className={cn('rounded-lg border px-3 py-2.5 text-left transition-all', on ? 'border-brand bg-brand-soft/60 ring-1 ring-brand/30' : 'border-line hover:border-line-strong hover:bg-surface-sunken')}
                      >
                        <PriorityBadge priority={p} />
                        <span className="mt-1 block text-xs text-ink-3">{PRIORITY_META[p].label === 'Critical' ? 'Safety risk or outage' : PRIORITY_META[p].label === 'High' ? 'Major disruption' : PRIORITY_META[p].label === 'Medium' ? 'Inconvenient' : 'Can be scheduled'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {sla && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-3">
                <Info className="mt-px size-3.5 shrink-0" />
                <span>
                  {sla.description ? `${sla.description} ` : ''}Target response within <span className="font-medium text-ink-2">{formatMinutes(sla.responseMinutes)}</span> and resolution within <span className="font-medium text-ink-2">{formatMinutes(sla.resolutionMinutes)}</span>.
                </span>
              </p>
            )}
          </fieldset>

          <div>
            <Label htmlFor="photos">Photos <span className="font-normal text-ink-4">(optional)</span></Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {photos.map((f, i) => (
                <span key={`${f.name}-${i}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt={f.name} className="size-16 rounded-lg border border-line object-cover" />
                  <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-white shadow" aria-label={`Remove ${f.name}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {photos.length < 5 && (
                <label htmlFor="photos" className="grid size-16 cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-ink-4 transition-colors hover:border-brand hover:text-brand">
                  <Camera className="size-5" />
                  <input id="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos((p) => [...p, f]); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" size="lg" loading={create.isPending} disabled={!categoryId}>
            <Send /> Submit request
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewWorkOrderPage() {
  return (
    <Suspense>
      <NewWorkOrderForm />
    </Suspense>
  );
}
