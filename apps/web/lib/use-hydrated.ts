'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => undefined;

/** False during SSR and hydration, true afterwards — for values that only exist in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
