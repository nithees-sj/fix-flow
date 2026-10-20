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

/**
 * Accepts only same-origin relative paths for post-sign-in redirects. Browsers treat `\` like
 * `/` and strip tabs/newlines, so `/\evil.example` or `/\t/evil.example` would otherwise
 * become protocol-relative and leave the site.
 */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(next)) return null;
  try {
    const base = 'https://fixflow.invalid';
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}
