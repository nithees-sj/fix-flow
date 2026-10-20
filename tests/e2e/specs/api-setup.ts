import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { email, linkFromEmail, PASSWORD, run } from './helpers';

/** Calls the API through the web origin (same cookies as the browser context). */
export async function apiClient(request: APIRequestContext) {
  const csrf = (await (await request.get('/api/v1/auth/csrf')).json()).csrfToken as string;
  const call = async <T = unknown>(method: string, path: string, data?: unknown): Promise<T> => {
    const res = await request.fetch(`/api/v1${path}`, { method, data, headers: { 'x-csrf-token': csrf } });
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
  return { call, csrf };
}

export interface Org {
  orgId: string;
  roomId: string;
  categories: Record<string, string>;
}

/** Admin signs up + creates an organization with one building and room (all via the API). */
export async function setupOrg(admin: BrowserContext, label: string): Promise<Org & { api: Awaited<ReturnType<typeof apiClient>> }> {
  const api = await apiClient(admin.request);
  await api.call('POST', '/auth/register', { name: `${label} Admin`, email: email(`${label}-admin`), password: PASSWORD });
  const created = await api.call<{ organization: { id: string } }>('POST', '/organizations', { name: `${label} ${run}`, industry: 'OFFICE', timezone: 'UTC' });
  const cats = await api.call<{ id: string; name: string }[]>('GET', '/categories');
  const building = await api.call<{ id: string }>('POST', '/locations', { name: 'HQ', type: 'BUILDING', parentId: null });
  const room = await api.call<{ id: string }>('POST', '/locations', { name: 'Meeting Room 3', type: 'ROOM', parentId: building.id });
  await api.call('POST', '/organizations/current/onboarding/complete');
  return { api, orgId: created.organization.id, roomId: room.id, categories: Object.fromEntries(cats.map((c) => [c.name, c.id])) };
}

/** Invites someone and accepts as a new account inside `ctx` (cookies end up in the context). */
export async function inviteAndJoin(adminApi: Awaited<ReturnType<typeof apiClient>>, ctx: BrowserContext, label: string, role: string, name: string): Promise<string> {
  const addr = email(label);
  await adminApi.call('POST', '/invitations', { invitations: [{ email: addr, role }] });
  const link = await linkFromEmail(addr, /http:\/\/[^\s]+\/invite\/[\w-]+/);
  const token = link.split('/invite/')[1]!;
  const api = await apiClient(ctx.request);
  const me = await api.call<{ user: { id: string } }>('POST', '/invitations/accept', { token, name, password: PASSWORD });
  expect(me.user.id).toBeTruthy();
  return me.user.id;
}
