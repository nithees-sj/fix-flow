'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { NOTIFICATION_TYPE_META, type NotificationType } from '@fixflow/shared';
import { SettingsSection } from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Skeleton } from '@/components/ui/display';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-client';

type Pref = { type: NotificationType; inApp: boolean; email: boolean };

export default function NotificationSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.preferences, queryFn: () => api<Pref[]>('/notifications/preferences') });
  // Unsaved edits layered over the server copy; null = no local changes.
  const [edits, setEdits] = useState<Pref[] | null>(null);
  const draft = edits ?? q.data ?? null;
  const save = useMutation({
    mutationFn: () => api<Pref[]>('/notifications/preferences', { method: 'PUT', body: { preferences: draft } }),
    onSuccess: (d) => { qc.setQueryData(qk.preferences, d); setEdits(null); toast.success('Notification preferences saved'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const dirty = edits !== null && JSON.stringify(edits) !== JSON.stringify(q.data);
  const set = (t: NotificationType, k: 'inApp' | 'email', v: boolean) => setEdits((d) => (d ?? q.data ?? []).map((p) => (p.type === t ? { ...p, [k]: v } : p)));

  return (
    <SettingsSection
      title="Notification preferences"
      description="Choose how you hear about activity in this organization. In-app notifications also appear live in the bell menu."
      footer={<Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save preferences</Button>}
    >
      {!draft ? (
        <div className="grid gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Notification preferences</caption>
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th scope="col" className="pb-2 font-medium">Event</th>
              <th scope="col" className="w-20 pb-2 text-center font-medium">In-app</th>
              <th scope="col" className="w-20 pb-2 text-center font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((p) => (
              <tr key={p.type} className="border-t border-line-subtle">
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  <span className="block font-medium text-ink">{NOTIFICATION_TYPE_META[p.type].label}</span>
                  <span className="block text-xs text-ink-3">{NOTIFICATION_TYPE_META[p.type].description}</span>
                </th>
                <td className="text-center"><Switch checked={p.inApp} onCheckedChange={(v) => set(p.type, 'inApp', v)} aria-label={`${NOTIFICATION_TYPE_META[p.type].label} in-app`} /></td>
                <td className="text-center"><Switch checked={p.email} onCheckedChange={(v) => set(p.type, 'email', v)} aria-label={`${NOTIFICATION_TYPE_META[p.type].label} email`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SettingsSection>
  );
}
