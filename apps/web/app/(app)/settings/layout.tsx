'use client';

import { Bell, Building2, Gauge, History, ListChecks, ShieldCheck, Tags, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Permission } from '@fixflow/shared';
import { useActor } from '@/lib/session';
import { cn } from '@/lib/utils';

const ITEMS: { href: string; label: string; icon: React.ReactNode; permission?: Permission }[] = [
  { href: '/settings/profile', label: 'Profile & security', icon: <UserRound /> },
  { href: '/settings/notifications', label: 'Notifications', icon: <Bell /> },
  { href: '/settings/organization', label: 'Organization', icon: <Building2 />, permission: 'org.settings' },
  { href: '/settings/permissions', label: 'Team permissions', icon: <ShieldCheck />, permission: 'org.settings' },
  { href: '/settings/sla', label: 'Priorities & SLA', icon: <Gauge />, permission: 'sla.manage' },
  { href: '/settings/categories', label: 'Categories', icon: <Tags />, permission: 'category.manage' },
  { href: '/settings/checklists', label: 'Checklists', icon: <ListChecks />, permission: 'checklist.manage' },
  { href: '/settings/audit', label: 'Audit log', icon: <History />, permission: 'audit.read' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can } = useActor();
  const items = ITEMS.filter((i) => !i.permission || can(i.permission));
  return (
    <>
      <h1 className="mb-5 text-[22px] font-semibold">Settings</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible">
          {items.map((i) => {
            const active = pathname === i.href;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors [&_svg]:size-4',
                  active ? 'bg-surface text-ink shadow-xs ring-1 ring-line [&_svg]:text-brand' : 'text-ink-2 hover:bg-surface-muted hover:text-ink [&_svg]:text-ink-4',
                )}
              >
                {i.icon}
                {i.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
