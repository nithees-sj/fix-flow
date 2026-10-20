import type { MeResponse } from '@fixflow/shared';

/** Where a user lands after sign-in, by role. */
export function landingFor(me: MeResponse): string {
  if (!me.activeOrganization) return '/onboarding';
  if (!me.activeOrganization.onboardingCompleted && me.activeOrganization.role === 'ORG_ADMIN') return '/onboarding';
  const role = me.activeOrganization.role;
  if (role === 'TECHNICIAN') return '/my-work';
  if (role === 'REQUESTER') return '/my-requests';
  return '/dashboard';
}

export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}
