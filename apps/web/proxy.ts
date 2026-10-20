import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic routing only (per Next.js guidance): visitors without the session hint cookie
 * are sent to sign-in before the app shell loads. Real authentication and authorization are
 * always enforced by the API on every request.
 */
const APP_PREFIXES = [
  '/dashboard',
  '/work-orders',
  '/my-work',
  '/my-requests',
  '/assets',
  '/locations',
  '/schedules',
  '/team',
  '/analytics',
  '/notifications',
  '/settings',
  '/onboarding',
  '/print',
];
const AUTH_PAGES = ['/sign-in', '/sign-up'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('ff_session');

  if (!hasSession && APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (hasSession && AUTH_PAGES.includes(pathname) && !request.nextUrl.searchParams.has('next')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Never touch API traffic (uploads stream through the rewrite unbuffered) or static assets.
  matcher: ['/((?!api/|_next/|favicon|icons/|sw.js|manifest.webmanifest|.*\\.(?:png|svg|ico|webp|jpg)$).*)'],
};
