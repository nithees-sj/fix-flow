'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/** Filter/sort/page state persisted in the URL (shareable, survives refresh and back/forward). */
export function useUrlState<T extends Record<string, string | undefined>>(defaults: T) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(() => {
    const out = { ...defaults } as Record<string, string | undefined>;
    for (const k of Object.keys(defaults)) {
      const v = params.get(k);
      if (v !== null) out[k] = v;
    }
    for (const [k, v] of params.entries()) if (!(k in out)) out[k] = v;
    return out as T;
  }, [params, defaults]);

  const set = useCallback(
    (patch: Partial<T>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      if (opts.resetPage && !('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, defaults],
  );

  return [state, set] as const;
}
