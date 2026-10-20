import type { ErrorCode, ProblemDetails } from '@fixflow/shared';

/** Error thrown for any non-2xx API response, carrying the RFC 9457 problem document. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK';
  readonly problem: Partial<ProblemDetails>;

  constructor(status: number, problem: Partial<ProblemDetails>) {
    super(problem.detail ?? problem.title ?? 'Request failed');
    this.status = status;
    this.code = (problem.code as ErrorCode) ?? (status === 0 ? 'NETWORK' : 'INTERNAL');
    this.problem = problem;
  }

  /** Field errors keyed by path, for react-hook-form `setError`. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.path, e.message]));
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const BASE = '/api/v1';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrf(): Promise<string> {
  let token = readCookie('ff_csrf');
  if (!token) {
    csrfPromise ??= fetch(`${BASE}/auth/csrf`, { credentials: 'same-origin' }).then(() => undefined).finally(() => (csrfPromise = null));
    await csrfPromise;
    token = readCookie('ff_csrf');
  }
  return token ?? '';
}

/**
 * Single-flight refresh. Across tabs, the Web Locks API serializes refreshes so two tabs
 * never rotate the same refresh token at once (the server also tolerates a short race).
 */
let refreshing: Promise<boolean> | null = null;
async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': await ensureCsrf() },
      });
      return res.ok || res.status === 409;
    };
    try {
      return typeof navigator !== 'undefined' && 'locks' in navigator
        ? await navigator.locks.request('fixflow-refresh', run)
        : await run();
    } catch {
      return false;
    }
  })().finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();
export function onSessionExpired(fn: SessionListener): () => void {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null | string[]>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Return the raw Response (downloads). */
  raw?: boolean;
}

export function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function toError(res: Response): Promise<ApiError> {
  let problem: Partial<ProblemDetails> = { status: res.status };
  try {
    problem = (await res.json()) as ProblemDetails;
  } catch {
    /* non-JSON */
  }
  return new ApiError(res.status, problem);
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = `${BASE}${path}${buildQuery(opts.query)}`;
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;

  const doFetch = async () => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined && !isForm) headers['content-type'] = 'application/json';
    if (UNSAFE.has(method)) headers['x-csrf-token'] = await ensureCsrf();
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    return fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      signal: opts.signal,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  };

  let res: Response;
  try {
    res = await doFetch();
    const isAuthCall = path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/refresh');
    if (res.status === 401 && !isAuthCall) {
      if (await refreshSession()) res = await doFetch();
      if (res.status === 401) {
        sessionListeners.forEach((l) => l());
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, { title: 'Network error', detail: 'You appear to be offline or the server is unreachable.' });
  }

  if (!res.ok) throw await toError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Multipart upload with progress events (fetch has no upload progress yet). */
export async function uploadFile<T>(path: string, file: Blob, fileName: string, onProgress?: (pct: number) => void, idempotencyKey?: string): Promise<T> {
  const csrf = await ensureCsrf();
  const send = () =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}${path}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('x-csrf-token', csrf);
      if (idempotencyKey) xhr.setRequestHeader('idempotency-key', idempotencyKey);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new ApiError(0, { title: 'Network error', detail: 'Upload failed — check your connection.' }));
      const form = new FormData();
      form.append('file', file, fileName);
      xhr.send(form);
    });
  let r = await send();
  if (r.status === 401 && (await refreshSession())) r = await send();
  if (r.status < 200 || r.status >= 300) {
    let problem: Partial<ProblemDetails> = { status: r.status };
    try {
      problem = JSON.parse(r.body) as ProblemDetails;
    } catch {
      /* ignore */
    }
    throw new ApiError(r.status, problem);
  }
  return JSON.parse(r.body) as T;
}

export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isApiError(e)) return e.problem.detail ?? e.message ?? fallback;
  return fallback;
}
