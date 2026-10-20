import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'ff_at';
export const REFRESH_COOKIE = 'ff_rt';
export const CSRF_COOKIE = 'ff_csrf';
export const CSRF_HEADER = 'x-csrf-token';
/** Non-secret hint ("a session exists") so the web proxy can redirect signed-out visitors early. */
export const SESSION_HINT_COOKIE = 'ff_session';

/** The refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface CookieConfig {
  secure: boolean;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

const base = (secure: boolean): CookieOptions => ({ httpOnly: true, secure, sameSite: 'lax', path: '/' });

/**
 * Sets the session cookies. The CSRF cookie is stable per browser (only issued when absent),
 * so open tabs keep a valid token across logins and refreshes.
 */
export function setSessionCookies(
  res: Response,
  cfg: CookieConfig,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
  existingCsrf?: string,
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base(cfg.secure), maxAge: cfg.accessTtlSeconds * 1000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(cfg.secure),
    path: REFRESH_COOKIE_PATH,
    maxAge: cfg.refreshTtlDays * 86_400_000,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', { ...base(cfg.secure), maxAge: cfg.refreshTtlDays * 86_400_000 });
  if (!existingCsrf) setCsrfCookie(res, cfg.secure, tokens.csrfToken);
}

/** Readable by JS on purpose (double-submit pattern); worthless to a cross-site attacker. */
export function setCsrfCookie(res: Response, secure: boolean, token: string): void {
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86_400_000 });
}

export function clearSessionCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, base(secure));
  res.clearCookie(REFRESH_COOKIE, { ...base(secure), path: REFRESH_COOKIE_PATH });
  res.clearCookie(SESSION_HINT_COOKIE, base(secure));
}
