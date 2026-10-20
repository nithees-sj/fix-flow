'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ROLE_LABELS, type MeResponse } from '@fixflow/shared';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { landingFor } from '@/lib/routing';
import { useMe } from '@/lib/session';
import { cn } from '@/lib/utils';

function OrgAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-slate-800 to-slate-600 text-xs font-semibold text-white', className)} aria-hidden>
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

export function OrgSwitcher() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const org = me?.activeOrganization;
  if (!me || !org) return null;

  const switchTo = async (organizationId: string) => {
    if (organizationId === org.id) return;
    try {
      const next = await api<MeResponse>('/auth/switch-organization', { method: 'POST', body: { organizationId } });
      qc.clear();
      qc.setQueryData(qk.me, next);
      toast.success(`Switched to ${next.activeOrganization?.name}`);
      router.replace(landingFor(next));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Menu>
      <MenuTrigger className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted data-[state=open]:bg-surface-muted">
        <OrgAvatar name={org.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{org.name}</span>
          <span className="block truncate text-xs text-ink-3">{ROLE_LABELS[org.role]}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-4" />
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Organizations</MenuLabel>
        {me.memberships.map((m) => (
          <MenuItem key={m.organizationId} onSelect={() => switchTo(m.organizationId)}>
            <OrgAvatar name={m.organizationName} className="size-6" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.organizationName}</span>
              <span className="block text-xs text-ink-3">{ROLE_LABELS[m.role]}</span>
            </span>
            {m.organizationId === org.id && <Check className="!text-brand" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => router.push('/onboarding?new=1')}>
          <Plus /> Create organization
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
