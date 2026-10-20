'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/menu';
import { makeQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: 'rounded-lg border border-line bg-surface text-ink shadow-lg font-sans text-sm',
            description: 'text-ink-3',
          },
        }}
      />
    </QueryClientProvider>
  );
}
