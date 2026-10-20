/**
 * Cross-tenant isolation — API LAYER.
 *  (a) Route sweep: every registered route with a path parameter is called by an admin of
 *      organization B using organization A's ids. Must answer 403/404 and leak nothing.
 *      A new parameterized route without a fixture below FAILS this test on purpose.
 *  (b) Body / filter injection: A's ids inside B's create/update payloads and list filters.
 *  (d) Side channels: notifications, attachments, sockets.
 * (Layer c — raw SQL / RLS / composite FKs — lives in packages/db/test/rls.test.ts.)
 */
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrg, testPhoto, type OrgFixture } from './fixtures.js';
import request from 'supertest';
import { Client, resetState, startHarness, type Harness } from './harness.js';

let h: Harness;
let A: OrgFixture;
let B: OrgFixture;
const aIds: Record<string, string> = {};
let aSecretTitle: string;

beforeAll(async () => {
  h = await startHarness();
  await resetState(h);
  A = await createOrg(h, 'Alpha Hospital');
  B = await createOrg(h, 'Bravo Apartments');

  aSecretTitle = `ALPHA-SECRET-${Date.now()}`;
  // Several work orders in A so A has numbers B does not.
  for (let i = 0; i < 4; i++) {
    await A.requester.client.post('/work-orders', { title: `${aSecretTitle} filler ${i}`, categoryId: A.categories.Plumbing, locationId: A.roomId }).expect(201);
  }
  const wo = await A.requester.client
    .post('/work-orders', { title: aSecretTitle, categoryId: A.categories.HVAC, assetId: A.assetId, priority: 'CRITICAL' })
    .expect(201);
  aIds.workOrder = wo.body.id;
  aIds.workOrderNumber = String(wo.body.number);
  aIds.checklistItem = wo.body.checklist[0].id;
  await A.manager.client.post(`/work-orders/${wo.body.id}/transitions`, { action: 'assign', expectedVersion: 1, assigneeId: A.tech.userId }).expect(200);
  const photo = await A.tech.client.upload(`/work-orders/${wo.body.id}/attachments?kind=PROGRESS`, 'file', await testPhoto(), 'a.png', 'image/png').expect(201);
  aIds.attachment = photo.body.id;
  aIds.asset = A.assetId;
  aIds.location = A.roomId;
  aIds.category = A.categories.HVAC;
  const templates = await A.manager.client.get('/checklist-templates').expect(200);
  aIds.checklistTemplate = templates.body[0].id;
  const inv = await A.admin.client.post('/invitations', { invitations: [{ email: `alpha-invitee-${Date.now()}@example.test`, role: 'TECHNICIAN' }] }).expect(201);
  aIds.invitation = inv.body.invited[0].id;
  const membership = await h.db.system.membership.findFirstOrThrow({ where: { organizationId: A.orgId, userId: A.tech.userId } });
  aIds.membership = membership.id;
  const note = await A.manager.client.get('/notifications').expect(200);
  aIds.notification = note.body.data[0].id;
  const session = await h.db.system.session.findFirstOrThrow({ where: { userId: A.admin.userId } });
  aIds.session = session.id;
  const schedule = await A.manager.client
    .post('/schedules', { title: 'Alpha filter service', categoryId: A.categories.HVAC, assetId: A.assetId, frequencyUnit: 'MONTH', frequencyInterval: 1, startsAt: new Date().toISOString() })
    .expect(201);
  aIds.schedule = schedule.body.id;
});
afterAll(async () => h.close());

/** Which org-A id to substitute for a route's parameter, by resource prefix. */
function paramFor(path: string, param: string): string | undefined {
  if (param === 'itemId') return aIds.checklistItem;
  if (param === 'number') return aIds.workOrderNumber;
  const prefix = path.replace('/api/v1/', '').split('/')[0];
  return {
    'work-orders': aIds.workOrder,
    attachments: aIds.attachment,
    assets: aIds.asset,
    locations: aIds.location,
    categories: aIds.category,
    'checklist-templates': aIds.checklistTemplate,
    invitations: aIds.invitation,
    members: aIds.membership,
    notifications: aIds.notification,
    profile: aIds.session,
    schedules: aIds.schedule,
  }[prefix ?? ''];
}

/** Minimal VALID bodies so requests reach the handler (and its tenant checks), not just validation. */
const BODIES: Record<string, object> = {
  'PATCH /api/v1/work-orders/:id': { expectedVersion: 1, title: 'pwned by bravo' },
  'POST /api/v1/work-orders/:id/transitions': { action: 'cancel', expectedVersion: 2, reason: 'cross-tenant attempt' },
  'POST /api/v1/work-orders/:id/comments': { body: 'hello from bravo' },
  'PUT /api/v1/work-orders/:id/checklist/:itemId': { completed: true },
  'POST /api/v1/work-orders/:id/checklist': { label: 'Injected step' },
  'PATCH /api/v1/assets/:id': { name: 'pwned asset' },
  'PATCH /api/v1/locations/:id': { name: 'pwned location' },
  'PATCH /api/v1/categories/:id': { name: 'pwned category' },
  'PATCH /api/v1/checklist-templates/:id': { name: 'pwned template' },
  'PATCH /api/v1/members/:id': { jobTitle: 'pwned' },
  'PUT /api/v1/members/:id/skills': { skills: [] },
  'PATCH /api/v1/schedules/:id': { active: false },
};
const NO_BODY = new Set([
  'GET',
  'DELETE',
  'POST /api/v1/work-orders/:id/attachments', // multipart; empty is fine (authorization runs first)
  'POST /api/v1/assets/:id/archive',
  'POST /api/v1/assets/:id/qr/rotate',
  'POST /api/v1/locations/:id/archive',
  'POST /api/v1/locations/:id/qr/rotate',
  'POST /api/v1/categories/:id/archive',
  'POST /api/v1/categories/:id/restore',
  'POST /api/v1/checklist-templates/:id/archive',
  'POST /api/v1/invitations/:id/revoke',
  'POST /api/v1/invitations/:id/resend',
  'POST /api/v1/notifications/:id/read',
  'POST /api/v1/schedules/:id/run-now',
]);

interface RouteDef {
  method: string;
  path: string;
}

function registeredRoutes(): RouteDef[] {
  const instance = h.app.getHttpAdapter().getInstance() as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const out: RouteDef[] = [];
  for (const layer of stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
    if (!layer.route) continue;
    for (const [m, on] of Object.entries(layer.route.methods)) if (on) out.push({ method: m.toUpperCase(), path: layer.route.path });
  }
  return out;
}

describe('(a) route sweep: org B cannot reach org A resources through any parameterized route', () => {
  it('covers every parameterized route and none of them leak', async () => {
    // Public QR routes are intentionally reachable without membership; covered separately below.
    const routes = registeredRoutes().filter((r) => r.path.includes(':') && !r.path.startsWith('/api/docs') && !r.path.startsWith('/api/v1/public/'));
    expect(routes.length).toBeGreaterThan(30);
    const missing: string[] = [];
    const failures: string[] = [];

    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
      const values = params.map((p) => paramFor(r.path, p));
      if (values.some((v) => !v)) {
        missing.push(key);
        continue;
      }
      const hasBody = !NO_BODY.has(r.method) && !NO_BODY.has(key);
      if (hasBody && !BODIES[key]) {
        missing.push(`${key} (no body fixture)`);
        continue;
      }
      let url = r.path.replace('/api/v1', '');
      params.forEach((p, i) => (url = url.replace(`:${p}`, values[i]!)));
      const c = B.admin.client;
      const res =
        r.method === 'GET' ? await c.get(url)
        : r.method === 'DELETE' ? await c.delete(url)
        : r.method === 'PUT' ? await c.put(url, BODIES[key])
        : r.method === 'PATCH' ? await c.patch(url, BODIES[key])
        : await c.post(url, BODIES[key]);
      const text = JSON.stringify(res.body ?? '') + (res.text ?? '');
      const leaked = Object.values(aIds).some((id) => id.length > 8 && text.includes(id)) || text.includes(aSecretTitle);
      if (![403, 404].includes(res.status) || leaked) failures.push(`${key} → ${res.status}${leaked ? ' (LEAK)' : ''}`);
    }

    expect(missing, 'Add fixtures for new parameterized routes').toEqual([]);
    expect(failures).toEqual([]);
  });

  it('organization A data is unchanged after the sweep', async () => {
    const wo = await h.db.system.workOrder.findUniqueOrThrow({ where: { id: aIds.workOrder } });
    expect(wo).toMatchObject({ title: aSecretTitle, status: 'ASSIGNED', organizationId: A.orgId });
    const asset = await h.db.system.asset.findUniqueOrThrow({ where: { id: aIds.asset } });
    expect(asset.name).toBe('Split AC unit');
    const comments = await h.db.system.workOrderComment.count({ where: { workOrderId: aIds.workOrder } });
    expect(comments).toBe(0);
    const schedule = await h.db.system.maintenanceSchedule.findUniqueOrThrow({ where: { id: aIds.schedule } });
    expect(schedule.active).toBe(true);
    expect(await h.db.system.workOrder.count({ where: { scheduleId: aIds.schedule } })).toBe(0);
    const invitation = await h.db.system.invitation.findUniqueOrThrow({ where: { id: aIds.invitation } });
    expect(invitation.revokedAt).toBeNull();
    const session = await h.db.system.session.findUniqueOrThrow({ where: { id: aIds.session } });
    expect(session.revokedAt).toBeNull();
  });
});

describe('(b) org A ids injected into org B payloads and filters are rejected', () => {
  it('creating a work order with A’s category, location or asset fails', async () => {
    const c = B.requester.client;
    await c.post('/work-orders', { title: 'x-tenant', categoryId: aIds.category, locationId: B.roomId }).expect(404);
    await c.post('/work-orders', { title: 'x-tenant', categoryId: B.categories.HVAC, locationId: aIds.location }).expect(404);
    await c.post('/work-orders', { title: 'x-tenant', categoryId: B.categories.HVAC, assetId: aIds.asset }).expect(404);
  });

  it('assets / locations / skills cannot reference A’s records', async () => {
    await B.admin.client.post('/assets', { name: 'Smuggled unit', assetTag: 'X-1', categoryId: B.categories.HVAC, locationId: aIds.location }).expect(404);
    await B.admin.client.post('/assets', { name: 'Smuggled unit', assetTag: 'X-2', categoryId: aIds.category, locationId: B.roomId }).expect(404);
    await B.admin.client.post('/locations', { name: 'Annex', type: 'ROOM', parentId: aIds.location }).expect(404);
    const bTech = await h.db.system.membership.findFirstOrThrow({ where: { organizationId: B.orgId, userId: B.tech.userId } });
    await B.admin.client.put(`/members/${bTech.id}/skills`, { skills: [{ categoryId: aIds.category, level: 2 }] }).expect(404);
    await B.admin.client.post('/categories', { name: 'Linked', defaultChecklistTemplateId: aIds.checklistTemplate }).expect(404);
  });

  it('assigning A’s technician or attaching A’s files to B’s work order fails', async () => {
    const wo = await B.requester.client.post('/work-orders', { title: 'Bravo leak', categoryId: B.categories.Plumbing, locationId: B.roomId }).expect(201);
    await B.manager.client.post(`/work-orders/${wo.body.id}/transitions`, { action: 'assign', expectedVersion: 1, assigneeId: A.tech.userId }).expect(404);
    await B.manager.client.post(`/work-orders/${wo.body.id}/transitions`, { action: 'assign', expectedVersion: 1, assigneeId: B.tech.userId }).expect(200);
    await B.tech.client.post(`/work-orders/${wo.body.id}/transitions`, { action: 'start', expectedVersion: 2 }).expect(200);
    const res = await B.tech.client.post(`/work-orders/${wo.body.id}/transitions`, {
      action: 'submit_resolution',
      expectedVersion: 3,
      notes: 'Trying to reuse another tenant’s evidence photo.',
      attachmentIds: [aIds.attachment],
    });
    expect(res.status).toBe(404);
  });

  it('list filters with A’s ids return nothing of A', async () => {
    for (const q of [`assetId=${aIds.asset}`, `locationId=${aIds.location}`, `categoryId=${aIds.category}`, `assigneeId=${A.tech.userId}`, `q=${aSecretTitle}`]) {
      const res = await B.admin.client.get(`/work-orders?${q}`).expect(200);
      expect(res.body.data).toEqual([]);
    }
    const assets = await B.admin.client.get(`/assets?locationId=${aIds.location}`).expect(200);
    expect(assets.body.data).toEqual([]);
  });

  it('switching to an organization without membership is refused', async () => {
    await B.admin.client.post('/auth/switch-organization', { organizationId: A.orgId }).expect(403);
  });
});

describe('(d) side channels', () => {
  it('B’s notification center contains nothing from A', async () => {
    const res = await B.manager.client.get('/notifications').expect(200);
    expect(JSON.stringify(res.body)).not.toContain(aSecretTitle);
  });

  it('sockets cannot join another tenant’s work-order room', async () => {
    const ticket = await B.admin.client.post('/realtime/ticket').expect(201);
    const socket: Socket = io(h.url, { path: '/realtime', auth: { ticket: ticket.body.ticket }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const denied = await socket.emitWithAck('workOrder.watch', { id: aIds.workOrder });
    expect(denied).toEqual({ ok: false });
    socket.disconnect();
  });

  it('a realtime ticket is single-use', async () => {
    const ticket = await B.admin.client.post('/realtime/ticket').expect(201);
    const connect = () =>
      new Promise<boolean>((resolve) => {
        const s = io(h.url, { path: '/realtime', auth: { ticket: ticket.body.ticket }, transports: ['websocket'], reconnection: false });
        s.on('session.expired', () => resolve(false));
        s.on('disconnect', () => resolve(false));
        s.on('connect', () => setTimeout(() => { resolve(s.connected); s.disconnect(); }, 300));
      });
    expect(await connect()).toBe(true);
    expect(await connect()).toBe(false);
  });
});

describe('public QR reporting', () => {
  const anon = () => request(h.server);
  const csrfPost = async (path: string, body: object, c?: Awaited<ReturnType<typeof Client.create>>) => {
    if (c) return c.post(path, body);
    const fresh = await Client.create(h);
    return fresh.post(path, body);
  };

  it('exposes only the minimal context needed for the form', async () => {
    const loc = await h.db.system.location.findUniqueOrThrow({ where: { id: A.roomId } });
    const res = await anon().get(`/api/v1/public/report/${loc.publicReportToken}`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['categories', 'defaultCategoryId', 'organizationName', 'qrReportingMode', 'target']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(aSecretTitle);
    expect(text).not.toContain(A.orgId);
    expect(text).not.toMatch(/@/); // no emails of any person
  });

  it('unknown or malformed tokens are not found', async () => {
    await anon().get('/api/v1/public/report/does-not-exist-123456').expect(404);
    await anon().get('/api/v1/public/report/%27%20OR%201%3D1').expect(404);
  });

  it('in AUTHENTICATED mode, guests and members of other organizations cannot submit', async () => {
    const loc = await h.db.system.location.findUniqueOrThrow({ where: { id: A.roomId } });
    const body = { title: 'Leak in corridor', categoryId: A.categories.Plumbing, guestName: 'Visitor', guestContact: 'v@example.com' };
    await csrfPost(`/public/report/${loc.publicReportToken}`, body).then((r) => expect(r.status).toBe(401));
    await csrfPost(`/public/report/${loc.publicReportToken}`, body, B.admin.client).then((r) => expect(r.status).toBe(403));
    const ok = await csrfPost(`/public/report/${loc.publicReportToken}`, { title: 'Leak in corridor', categoryId: A.categories.Plumbing, priority: 'HIGH' }, A.requester.client);
    expect(ok.status).toBe(201);
    const wo = await h.db.system.workOrder.findFirstOrThrow({ where: { organizationId: A.orgId, number: ok.body.workOrderNumber } });
    expect(wo).toMatchObject({ source: 'QR', requesterId: A.requester.userId, priority: 'HIGH', locationId: A.roomId });
  });

  it('in PUBLIC mode guests can report, but cannot set priority and must pass the honeypot', async () => {
    await A.admin.client.patch('/organizations/current/policy', { qrReportingMode: 'PUBLIC' }).expect(200);
    const asset = await h.db.system.asset.findUniqueOrThrow({ where: { id: A.assetId } });
    const res = await csrfPost(`/public/report/${asset.publicReportToken}`, { title: 'Strange smell from AC', guestName: 'Visiting parent', guestContact: 'parent@example.com', priority: 'CRITICAL' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ trackable: false });
    const wo = await h.db.system.workOrder.findFirstOrThrow({ where: { organizationId: A.orgId, number: res.body.workOrderNumber } });
    expect(wo).toMatchObject({ source: 'GUEST_QR', requesterId: null, priority: 'MEDIUM', assetId: A.assetId, guestName: 'Visiting parent' });
    const bot = await csrfPost(`/public/report/${asset.publicReportToken}`, { title: 'Buy cheap', guestName: 'Bot', guestContact: 'bot@example.com', website: 'http://spam' });
    expect(bot.status).toBe(400);
    await A.admin.client.patch('/organizations/current/policy', { qrReportingMode: 'AUTHENTICATED' }).expect(200);
  });

  it('rotating a token invalidates printed labels', async () => {
    const before = await h.db.system.location.findUniqueOrThrow({ where: { id: A.roomId } });
    await A.admin.client.post(`/locations/${A.roomId}/qr/rotate`).expect(200);
    await anon().get(`/api/v1/public/report/${before.publicReportToken}`).expect(404);
  });
});
