'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Card, CardHeader } from '@/components/ui/display';
import { api, errorMessage } from '@/lib/api';

/** QR label preview with print/download and token rotation (invalidates printed labels). */
export function QrPanel({ kind, id, label, sub, reportUrl }: { kind: 'assets' | 'locations'; id: string; label: string; sub?: string; reportUrl: string | null }) {
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [url, setUrl] = useState(reportUrl);
  const rotate = useMutation({
    mutationFn: () => api<{ reportUrl: string }>(`/${kind}/${id}/qr/rotate`, { method: 'POST' }),
    onSuccess: (r) => {
      setUrl(r.reportUrl);
      setVersion((v) => v + 1);
      setConfirm(false);
      toast.success('New QR code issued', { description: 'Previously printed labels no longer work — print and replace them.' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!reportUrl) return null;
  const src = `/api/v1/${kind}/${id}/qr?v=${version}`;
  return (
    <Card>
      <CardHeader title="QR label" description="Scanning opens a prefilled issue report" />
      <div className="flex items-center gap-4 px-5 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`QR code for ${label}`} className="size-28 rounded-lg border border-line bg-white p-1.5" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{label}</p>
          {sub && <p className="truncate font-mono text-xs text-ink-3">{sub}</p>}
          <p className="mt-2 break-all text-[11px] text-ink-4">{url}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line-subtle px-5 py-3">
        <Button asChild variant="secondary" size="sm">
          <a href={`/print/qr?${kind === 'assets' ? 'asset' : 'location'}=${id}`} target="_blank" rel="noreferrer">
            <Printer /> Print label
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/v1/${kind}/${id}/qr?format=png`} download>
            <Download /> PNG
          </a>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          <RefreshCw /> Rotate
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Issue a new QR code?"
        description="Labels already printed for this item will stop working. Use this if a label was copied or moved."
        confirmLabel="Rotate QR code"
        tone="danger"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </Card>
  );
}
