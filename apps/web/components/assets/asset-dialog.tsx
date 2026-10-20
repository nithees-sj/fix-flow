'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { ASSET_STATUSES, ASSET_STATUS_META, createAssetSchema, type AssetDetail } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { describedBy, Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyServerErrors, useZodForm } from '@/lib/forms';
import { useCategories, useLocations } from '@/lib/queries';

export function AssetDialog({ onClose, asset }: { onClose: () => void; asset?: AssetDetail }) {
  const qc = useQueryClient();
  const router = useRouter();
  const categories = useCategories();
  const locations = useLocations();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(createAssetSchema, {
    defaultValues: asset
      ? { name: asset.name, assetTag: asset.assetTag, categoryId: asset.category.id, locationId: asset.location.id, status: asset.status, manufacturer: asset.manufacturer ?? '', model: asset.model ?? '', serialNumber: asset.serialNumber ?? '', notes: asset.notes ?? '', installDate: asset.installDate?.slice(0, 10) ?? null, warrantyExpiresAt: asset.warrantyExpiresAt?.slice(0, 10) ?? null }
      : { name: '', assetTag: '', categoryId: '', locationId: '', status: 'OPERATIONAL', manufacturer: '', model: '', serialNumber: '' },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (v: object) => (asset ? api<AssetDetail>(`/assets/${asset.id}`, { method: 'PATCH', body: v }) : api<AssetDetail>('/assets', { method: 'POST', body: v })),
    onSuccess: (a) => {
      toast.success(asset ? 'Asset updated' : 'Asset added');
      void qc.invalidateQueries({ queryKey: ['assets'] });
      onClose();
      if (!asset) router.push(`/assets/${a.id}`);
    },
    onError: (e) => setError(applyServerErrors(form, e)),
  });
  const clean = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x]));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={asset ? 'Edit asset' : 'Add asset'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={save.isPending} onClick={form.handleSubmit((v) => save.mutate(clean(v as Record<string, unknown>)))}>{asset ? 'Save changes' : 'Add asset'}</Button>
          </>
        }
      >
        {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="a-name" error={errors.name?.message}>
            <Input id="a-name" placeholder="Split AC unit" aria-invalid={!!errors.name} aria-describedby={describedBy('a-name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <Field label="Asset tag" htmlFor="a-tag" error={errors.assetTag?.message} hint="Printed on the label, e.g. HVAC-204">
            <Input id="a-tag" className="font-mono uppercase" aria-invalid={!!errors.assetTag} {...form.register('assetTag')} />
          </Field>
          <Field label="Category" htmlFor="a-cat" error={errors.categoryId ? 'Choose a category' : undefined}>
            <NativeSelect id="a-cat" {...form.register('categoryId')}>
              <option value="">Select…</option>
              {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Location" htmlFor="a-loc" error={errors.locationId ? 'Choose a location' : undefined}>
            <Controller control={form.control} name="locationId" render={({ field }) => (
              <Combobox id="a-loc" value={field.value} onChange={(v) => field.onChange(v ?? '')} options={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name, description: l.path }))} placeholder="Where is it?" invalid={!!errors.locationId} />
            )} />
          </Field>
          <Field label="Status" htmlFor="a-status">
            <NativeSelect id="a-status" {...form.register('status')}>
              {ASSET_STATUSES.map((x) => <option key={x} value={x}>{ASSET_STATUS_META[x].label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Manufacturer" htmlFor="a-mfr" optional><Input id="a-mfr" {...form.register('manufacturer')} /></Field>
          <Field label="Model" htmlFor="a-model" optional><Input id="a-model" {...form.register('model')} /></Field>
          <Field label="Serial number" htmlFor="a-sn" optional><Input id="a-sn" {...form.register('serialNumber')} /></Field>
          <Field label="Install date" htmlFor="a-inst" optional><Input id="a-inst" type="date" {...form.register('installDate')} /></Field>
          <Field label="Warranty expires" htmlFor="a-war" optional><Input id="a-war" type="date" {...form.register('warrantyExpiresAt')} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
