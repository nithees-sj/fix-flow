'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { LOCATION_PARENT_RULES, LOCATION_TYPES, LOCATION_TYPE_LABELS, type LocationDto, type LocationType } from '@fixflow/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-client';

/** Create a location under `parent` (or top-level), or rename/recode an existing one. */
export function LocationDialog({ parent, existing, onClose }: { parent: LocationDto | null; existing?: LocationDto; onClose: () => void }) {
  const qc = useQueryClient();
  const allowed = LOCATION_TYPES.filter((t) => LOCATION_PARENT_RULES[t].includes(parent ? parent.type : null));
  const [type, setType] = useState<LocationType>(existing?.type ?? allowed[0] ?? 'BUILDING');
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      existing
        ? api(`/locations/${existing.id}`, { method: 'PATCH', body: { name: name.trim(), code: code.trim() } })
        : api('/locations', { method: 'POST', body: { name: name.trim(), type, parentId: parent?.id ?? null, code: code.trim() } }),
    onSuccess: () => {
      toast.success(existing ? 'Location updated' : 'Location added');
      void qc.invalidateQueries({ queryKey: qk.locations });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={existing ? `Edit ${existing.name}` : parent ? `Add inside ${parent.name}` : 'Add a site or building'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>{existing ? 'Save' : 'Add location'}</Button>
          </>
        }
      >
        {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
        <div className="grid gap-4">
          {!existing && (
            <Field label="Type" htmlFor="loc-type">
              <NativeSelect id="loc-type" value={type} onChange={(e) => setType(e.target.value as LocationType)}>
                {allowed.map((t) => <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Name" htmlFor="loc-name">
            <Input id="loc-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'ROOM' ? 'Lecture Hall 204' : type === 'FLOOR' ? 'Second floor' : 'Science Block'} />
          </Field>
          <Field label="Short code" htmlFor="loc-code" optional hint="Shown on labels and reports, e.g. SB-204">
            <Input id="loc-code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
