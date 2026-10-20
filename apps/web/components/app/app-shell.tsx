'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu as MenuIcon, Plus, Search, Settings, UserRound, WifiOff } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/controls';
import { Avatar, Skeleton } from '@/components/ui/display';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from '@/components/ui/menu';
import { isApiError, onSessionExpired } from '@/lib/api';
import { RealtimeProvider, useRealtime } from '@/lib/realtime';
import { useActor, useMe, useSignOut } from '@/lib/session';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { visibleNav, type NavSection } from './nav';
import { NotificationBell, useNotifications } from './notification-bell';
import { OrgSwitcher } from './org-switcher';
import { OutboxSync } from './outbox-sync';

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useNotifications();
  const unread = data?.unreadCount ?? 0;
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={i}>
          {section.label && <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-4">{section.label}</p>}
          <ul className="grid gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors',
                      active ? 'bg-surface text-ink shadow-xs ring-1 ring-line' : 'text-ink-2 hover:bg-surface-muted hover:text-ink',
                    )}
                  >
                    <item.icon className={cn('size-[18px] shrink-0', active ? 'text-brand' : 'text-ink-4 group-hover:text-ink-3')} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.href === '/notifications' && unread > 0 && (
                      <span className="rounded-full bg-brand-soft px-1.5 text-[11px] font-semibold leading-5 text-brand-ink tabular">{unread}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, org } = useActor();
  const signOut = useSignOut();
  const router = useRouter();
  if (!user) return null;
  return (
    <Menu>
      <MenuTrigger className="rounded-full focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none" aria-label="Account menu">
        <Avatar name={user.name} />
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuLabel>
          <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block truncate font-normal">{user.email}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push('/settings/profile')}>
          <UserRound /> Profile & security
        </MenuItem>
        {org && (
          <MenuItem onSelect={() => router.push('/settings')}>
            <Settings /> Settings
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function LiveDot() {
  const { status } = useRealtime();
  const label = status === 'live' ? 'Live updates on' : status === 'connecting' ? 'Connecting…' : 'Live updates paused';
  return (
    <Tooltip content={label}>
      <span className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-3 sm:inline-flex" role="status" aria-label={label}>
        <span className={cn('size-2 rounded-full', status === 'live' ? 'bg-success' : status === 'connecting' ? 'bg-warning animate-pulse' : 'bg-ink-4')} />
        {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Paused'}
      </span>
    </Tooltip>
  );
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** navigator.onLine as an external store; the server snapshot assumes online. */
function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  const { role, can, org } = useActor();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const online = useOnline();

  // Session gate: unauthenticated → sign-in; no organization → onboarding.
  useEffect(() => {
    if (me.isError && isApiError(me.error) && me.error.status === 401) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    } else if (me.data && !me.data.activeOrganization && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [me.isError, me.error, me.data, router, pathname]);

  useEffect(
    () =>
      onSessionExpired(() => {
        qc.clear();
        router.replace(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      }),
    [qc, router],
  );

  if (!me.data?.activeOrganization || !org) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  const sections = visibleNav(role, can);
  const mobileTabs = sections.flatMap((s) => s.items).filter((i) => i.mobile).slice(0, 4);

  return (
    <RealtimeProvider organizationId={org.id}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface-sunken lg:flex">
          <div className="flex h-14 items-center px-4">
            <Logo href="/dashboard" size="sm" />
          </div>
          <div className="px-3">
            <OrgSwitcher />
          </div>
          <div className="mt-4 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
            <NavLinks sections={sections} />
          </div>
          <div className="border-t border-line p-3">
            <Button asChild className="w-full">
              <Link href="/work-orders/new">
                <Plus /> Report an issue
              </Link>
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75 sm:px-5">
            <D.Root open={mobileNav} onOpenChange={setMobileNav}>
              <D.Trigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <MenuIcon />
                </Button>
              </D.Trigger>
              <D.Portal>
                <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
                <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[288px] flex-col border-r border-line bg-surface-sunken shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden">
                  <D.Title className="sr-only">Navigation</D.Title>
                  <D.Description className="sr-only">Main navigation</D.Description>
                  <div className="flex h-14 items-center px-4">
                    <Logo href="/dashboard" size="sm" />
                  </div>
                  <div className="px-3">
                    <OrgSwitcher />
                  </div>
                  <div className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
                    <NavLinks sections={sections} onNavigate={() => setMobileNav(false)} />
                  </div>
                </D.Content>
              </D.Portal>
            </D.Root>
            <div className="lg:hidden">
              <Logo href="/dashboard" size="sm" className="[&>span]:hidden sm:[&>span]:inline" />
            </div>

            <button
              type="button"
              onClick={() => setPalette(true)}
              className="ml-auto flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-ink-4 shadow-xs transition-colors hover:border-line-strong hover:text-ink-3 sm:ml-0 sm:w-72 lg:w-80"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left max-sm:sr-only">Search…</span>
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </button>
            <div className="flex items-center gap-1 sm:ml-auto">
              {me.data.user && <OutboxSync userId={me.data.user.id} organizationId={org.id} />}
              <LiveDot />
              <NotificationBell />
              <Button asChild size="sm" className="hidden sm:inline-flex lg:hidden">
                <Link href="/work-orders/new">
                  <Plus /> Report
                </Link>
              </Button>
              <div className="ml-1">
                <UserMenu />
              </div>
            </div>
          </header>

          {!online && (
            <div role="status" className="flex items-center justify-center gap-2 border-b border-amber-200 bg-warning-soft px-4 py-2 text-[13px] font-medium text-warning-ink">
              <WifiOff className="size-4" /> You’re offline. Recent work stays viewable; supported changes sync when you reconnect.
            </div>
          )}

          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>

        {/* Mobile bottom tabs */}
        <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md safe-bottom lg:hidden">
          <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
            {mobileTabs.map((t) => {
              const active = isActive(pathname, t.href);
              return (
                <li key={t.href} className="flex-1">
                  <Link href={t.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-brand-ink' : 'text-ink-3')}>
                    <t.icon className="size-5" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <Link href="/work-orders/new" className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-3">
                <span className="grid size-7 place-items-center rounded-lg bg-brand text-white">
                  <Plus className="size-4" />
                </span>
                Report
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </RealtimeProvider>
  );
}
