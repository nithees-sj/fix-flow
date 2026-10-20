'use client';

import { Building2, ChevronRight, DoorOpen, Layers, MapPin, Plus, Printer, Search, Trees } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LOCATION_TYPE_LABELS, type LocationDto, type LocationType } from '@fixflow/shared';
import { LocationDialog } from '@/components/locations/location-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/menu';
import { useLocations } from '@/lib/queries';
import { useActor } from '@/lib/session';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<LocationType, React.ReactNode> = {
  SITE: <Trees />,
  BUILDING: <Building2 />,
  FLOOR: <Layers />,
  ROOM: <DoorOpen />,
  AREA: <MapPin />,
};

type Node = LocationDto & { children: Node[] };

function buildTree(list: LocationDto[]): Node[] {
  const map = new Map<string, Node>(list.map((l) => [l.id, { ...l, children: [] }]));
  const roots: Node[] = [];
  for (const n of map.values()) {
    const p = n.parentId ? map.get(n.parentId) : undefined;
    if (p) p.children.push(n);
    else roots.push(n);
  }
  const sort = (ns: Node[]) => {
    ns.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    ns.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function totals(n: Node): { assets: number; open: number } {
  return n.children.reduce((acc, c) => {
    const t = totals(c);
    return { assets: acc.assets + t.assets, open: acc.open + t.open };
  }, { assets: n.assetCount, open: n.openWorkOrders });
}

export default function LocationsPage() {
  const { can } = useActor();
  const locations = useLocations();
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ parent: LocationDto | null } | null>(null);
  const tree = useMemo(() => buildTree(locations.data ?? []), [locations.data]);
  const manage = can('location.manage');

  const matches = useMemo(() => {
    if (!q.trim()) return null;
    const t = q.toLowerCase();
    return (locations.data ?? []).filter((l) => l.path.toLowerCase().includes(t) || l.code?.toLowerCase().includes(t));
  }, [q, locations.data]);

  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const Row = ({ node, depth }: { node: Node; depth: number }) => {
    const open = expanded.has(node.id) || depth === 0;
    const t = totals(node);
    return (
      <li>
        <div className="group flex items-center gap-2 border-b border-line-subtle py-2 pr-4 hover:bg-surface-sunken" style={{ paddingLeft: 16 + depth * 22 }}>
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className={cn('grid size-6 shrink-0 place-items-center rounded text-ink-4 hover:bg-surface-muted hover:text-ink', !node.children.length && 'invisible')}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={open}
          >
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-3 [&_svg]:size-4">{TYPE_ICON[node.type]}</span>
          <Link href={`/locations/${node.id}`} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink hover:text-brand-ink">{node.name}</span>
            <span className="block text-xs text-ink-3">
              {LOCATION_TYPE_LABELS[node.type]}
              {node.code && <span className="font-mono"> · {node.code}</span>}
            </span>
          </Link>
          <span className="hidden text-xs text-ink-3 sm:inline tabular">{t.assets} asset{t.assets === 1 ? '' : 's'}</span>
          {t.open > 0 ? <Badge tone="amber">{t.open} open</Badge> : <span className="hidden w-14 sm:inline" />}
          {manage && node.type !== 'ROOM' && (
            <Tooltip content={`Add inside ${node.name}`}>
              <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Add location inside ${node.name}`} onClick={() => setAdding({ parent: node })}>
                <Plus />
              </Button>
            </Tooltip>
          )}
        </div>
        {open && node.children.length > 0 && (
          <ul>
            {node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Locations"
        description="Sites, buildings, floors and rooms. Every location has a QR label for instant reporting."
        actions={
          <>
            {manage && (
              <Button asChild variant="secondary" size="sm">
                <Link href="/print/qr" target="_blank"><Printer /> Print all labels</Link>
              </Button>
            )}
            {manage && <Button size="sm" onClick={() => setAdding({ parent: null })}><Plus /> Add site or building</Button>}
          </>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 sm:px-5">
          <div className="w-full sm:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a room, floor or code" aria-label="Search locations" leading={<Search />} className="h-8 text-[13px]" />
          </div>
          {!matches && (
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setExpanded(new Set((locations.data ?? []).map((l) => l.id)))}>Expand all</Button>
          )}
        </div>
        {locations.isLoading && <div className="grid gap-2 p-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
        {locations.data?.length === 0 && (
          <EmptyState icon={<MapPin />} title="No locations yet" description="Add your first building so people can report exactly where issues are." action={manage && <Button onClick={() => setAdding({ parent: null })}><Plus /> Add building</Button>} />
        )}
        {matches ? (
          <ul>
            {matches.map((l) => (
              <li key={l.id}>
                <Link href={`/locations/${l.id}`} className="flex items-center gap-3 border-b border-line-subtle px-5 py-2.5 hover:bg-surface-sunken">
                  <span className="grid size-7 place-items-center rounded-md bg-surface-muted text-ink-3 [&_svg]:size-4">{TYPE_ICON[l.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{l.path}</span>
                  {l.openWorkOrders > 0 && <Badge tone="amber">{l.openWorkOrders} open</Badge>}
                </Link>
              </li>
            ))}
            {matches.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-3">No locations match “{q}”.</li>}
          </ul>
        ) : (
          <ul aria-label="Location hierarchy">{tree.map((n) => <Row key={n.id} node={n} depth={0} />)}</ul>
        )}
      </Card>
      {adding && <LocationDialog parent={adding.parent} onClose={() => setAdding(null)} />}
    </>
  );
}
