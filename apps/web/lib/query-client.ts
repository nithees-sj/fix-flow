import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Run the queryFn even when offline so `offlineFirst` can serve device snapshots.
        networkMode: 'offlineFirst',
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          // Never retry client errors (auth, permission, validation, not found).
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return count < 2;
        },
      },
      // The offline outbox decides what to do without a network — never pause mutations.
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

/** Query keys in one place so realtime invalidation stays consistent. */
export const qk = {
  me: ['me'] as const,
  org: ['org'] as const,
  dashboard: (range: string) => ['dashboard', range] as const,
  analytics: (range: string) => ['analytics', range] as const,
  workOrders: (params: object) => ['work-orders', 'list', params] as const,
  workOrdersAll: ['work-orders'] as const,
  workOrder: (id: string) => ['work-orders', 'detail', id] as const,
  workOrderByNumber: (n: number) => ['work-orders', 'number', n] as const,
  timeline: (id: string) => ['work-orders', 'timeline', id] as const,
  suggestions: (id: string) => ['work-orders', 'suggestions', id] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  categories: ['categories'] as const,
  locations: ['locations'] as const,
  location: (id: string) => ['locations', id] as const,
  assets: (params: object) => ['assets', 'list', params] as const,
  asset: (id: string) => ['assets', id] as const,
  members: (params: object) => ['members', params] as const,
  member: (id: string) => ['members', 'detail', id] as const,
  invitations: ['invitations'] as const,
  slaPolicies: ['sla-policies'] as const,
  checklists: ['checklist-templates'] as const,
  schedules: ['schedules'] as const,
  audit: (params: object) => ['audit', params] as const,
  sessions: ['sessions'] as const,
  preferences: ['notification-preferences'] as const,
};
