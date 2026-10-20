'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse, Permission, Role } from '@fixflow/shared';
import { api, isApiError } from './api';
import { qk } from './query-client';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api<MeResponse>('/auth/me'),
    staleTime: 60_000,
    retry: (count, e) => !(isApiError(e) && e.status === 401) && count < 2,
  });
}

/** The active organization context (only valid inside the authenticated app shell). */
export function useActor() {
  const { data } = useMe();
  const org = data?.activeOrganization;
  const role: Role = org?.role ?? 'REQUESTER';
  const perms = new Set<Permission>(org?.permissions ?? []);
  return {
    me: data,
    user: data?.user,
    org,
    role,
    can: (p: Permission) => perms.has(p),
    isManager: role === 'MANAGER' || role === 'ORG_ADMIN',
    isAdmin: role === 'ORG_ADMIN',
    isTechnician: role === 'TECHNICIAN',
    isRequester: role === 'REQUESTER',
  };
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      qc.clear();
      await clearOfflineData();
      window.location.assign('/sign-in');
    }
  };
}

/** Private cached data must not outlive the session on shared devices. */
async function clearOfflineData(): Promise<void> {
  try {
    const { clearOfflineStore } = await import('./offline/store');
    await clearOfflineStore();
  } catch {
    /* offline module not available */
  }
}
