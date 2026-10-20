'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { AssetSummary, LocationDto, Paginated } from '@fixflow/shared';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';

interface Label {
  key: string;
  kind: 'assets' | 'locations';
  id: string;
  title: string;
  sub: string;
}

/** Printable QR label sheet (A4, 3 columns). Each label opens the prefilled report form. */
function Sheet() {
  const params = useSearchParams();
  const me = useMe();
  const onlyAsset = params.get('asset');
  const onlyLocation = params.get('location');
  const assets = useQuery({ queryKey: ['print', 'assets'], queryFn: () => api<Paginated<AssetSummary>>('/assets', { query: { pageSize: 100 } }), enabled: !onlyLocation });
  const locations = useQuery({ queryKey: ['print', 'locations'], queryFn: () => api<LocationDto[]>('/locations'), enabled: !onlyAsset });

  const labels: Label[] = [
    ...(assets.data?.data ?? []).filter((a) => !onlyAsset || a.id === onlyAsset).map((a) => ({ key: `a${a.id}`, kind: 'assets' as const, id: a.id, title: a.name, sub: `${a.assetTag} · ${a.location.name}` })),
    ...(onlyAsset ? [] : (locations.data ?? []).filter((l) => (onlyLocation ? l.id === onlyLocation : l.type === 'ROOM' || l.type === 'AREA')).map((l) => ({ key: `l${l.id}`, kind: 'locations' as const, id: l.id, title: l.name, sub: l.code ?? l.path }))),
  ];

  return (
    <div className="min-h-dvh bg-white">
      <style>{`@media print { .no-print { display: none !important } @page { size: A4; margin: 12mm } body { background: white } }`}</style>
      <div className="no-print flex items-center justify-between border-b border-line px-6 py-3">
        <p className="text-sm text-ink-2">{labels.length} label{labels.length === 1 ? '' : 's'} · {me.data?.activeOrganization?.name}</p>
        <Button size="sm" onClick={() => window.print()}><Printer /> Print</Button>
      </div>
      <main id="main" className="mx-auto grid max-w-[190mm] grid-cols-3 gap-4 p-6 print:p-0">
        {labels.map((l) => (
          <article key={l.key} className="flex break-inside-avoid flex-col items-center rounded-xl border border-dashed border-line-strong p-4 text-center">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-2"><LogoMark className="size-4" /> Report an issue</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/v1/${l.kind}/${l.id}/qr`} alt={`QR code for ${l.title}`} className="size-36" />
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{l.title}</p>
            <p className="line-clamp-1 font-mono text-[10px] text-ink-3">{l.sub}</p>
            <p className="mt-1.5 text-[10px] text-ink-4">Scan with your phone camera</p>
          </article>
        ))}
      </main>
    </div>
  );
}

export default function PrintQrPage() {
  return (
    <Suspense>
      <Sheet />
    </Suspense>
  );
}
