'use client';

import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Boxes, ClipboardList, CornerDownLeft, MapPin, Plus, Search, User } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatWorkOrderNumber, ROLE_LABELS, STATUS_META, type SearchResults } from '@fixflow/shared';
import { Badge } from '@/components/ui/display';
import { Kbd } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { useActor } from '@/lib/session';
import { visibleNav } from './nav';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { role, can } = useActor();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 180);
  const results = useQuery({
    queryKey: ['search', term],
    queryFn: () => api<SearchResults>('/search', { query: { q: term } }),
    enabled: open && term.length > 0,
    staleTime: 10_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ('');
    router.push(href);
  };
  const r = results.data;
  const pages = visibleNav(role, can).flatMap((s) => s.items);

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">Search work orders, assets, locations and people, or jump to a page.</D.Description>
          <Command shouldFilter={false} label="Search" className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-line-subtle px-4">
              <Search className="size-4 text-ink-4" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search work orders, assets, people… or WO-0042"
                className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">{results.isFetching ? 'Searching…' : 'No matches.'}</Command.Empty>
              {!term && (
                <>
                  <Group heading="Quick actions">
                    <Item onSelect={() => go('/work-orders/new')} icon={<Plus />} label="Report an issue" />
                  </Group>
                  <Group heading="Go to">
                    {pages.map((p) => (
                      <Item key={p.href} onSelect={() => go(p.href)} icon={<p.icon />} label={p.label} />
                    ))}
                  </Group>
                </>
              )}
              {r && r.workOrders.length > 0 && (
                <Group heading="Work orders">
                  {r.workOrders.map((w) => (
                    <Item
                      key={w.id}
                      onSelect={() => go(`/work-orders/${w.number}`)}
                      icon={<ClipboardList />}
                      label={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-xs text-ink-3">{formatWorkOrderNumber(w.number)}</span>
                          <span className="truncate">{w.title}</span>
                        </span>
                      }
                      trailing={<Badge tone={STATUS_META[w.status].tone}>{STATUS_META[w.status].label}</Badge>}
                    />
                  ))}
                </Group>
              )}
              {r && r.assets.length > 0 && (
                <Group heading="Assets">
                  {r.assets.map((a) => (
                    <Item key={a.id} onSelect={() => go(`/assets/${a.id}`)} icon={<Boxes />} label={a.name} trailing={<span className="font-mono text-xs text-ink-3">{a.assetTag}</span>} />
                  ))}
                </Group>
              )}
              {r && r.locations.length > 0 && (
                <Group heading="Locations">
                  {r.locations.map((l) => (
                    <Item key={l.id} onSelect={() => go(`/locations/${l.id}`)} icon={<MapPin />} label={<span className="truncate">{l.path}</span>} />
                  ))}
                </Group>
              )}
              {r && r.people.length > 0 && (
                <Group heading="People">
                  {r.people.map((p) => (
                    <Item key={p.userId} onSelect={() => go(`/team?q=${encodeURIComponent(p.name)}`)} icon={<User />} label={p.name} trailing={<span className="text-xs text-ink-3">{ROLE_LABELS[p.role]}</span>} />
                  ))}
                </Group>
              )}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-line-subtle px-4 py-2 text-[11px] text-ink-4">
              <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="inline-flex items-center gap-1"><Kbd><CornerDownLeft className="size-3" /></Kbd> open</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={heading} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
      {children}
    </Command.Group>
  );
}

function Item({ onSelect, icon, label, trailing }: { onSelect: () => void; icon: React.ReactNode; label: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <Command.Item onSelect={onSelect} className="flex cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm text-ink data-[selected=true]:bg-surface-muted [&_svg]:size-4 [&>svg]:text-ink-3">
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      {trailing}
    </Command.Item>
  );
}
