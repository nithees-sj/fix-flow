import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrg, testPhoto, type OrgFixture } from './fixtures.js';
import { resetState, startHarness, type Harness } from './harness.js';

let h: Harness;
let o: OrgFixture;

beforeAll(async () => {
  h = await startHarness();
  await resetState(h);
  o = await createOrg(h);
});
afterAll(async () => h.close());

const transition = (m: OrgFixture['manager'], id: string, body: object) => m.client.post(`/work-orders/${id}/transitions`, body);

describe('complete maintenance lifecycle', () => {
  let woId: string;
  let version: number;

  it('a requester reports an issue on an asset', async () => {
    const res = await o.requester.client
      .post('/work-orders', {
        title: 'AC not cooling in Lecture Hall 204',
        description: 'Room is at 31°C during lectures.',
        priority: 'HIGH',
        categoryId: o.categories.HVAC,
        assetId: o.assetId,
      })
      .expect(201);
    expect(res.body).toMatchObject({ number: 1, status: 'OPEN', priority: 'HIGH', source: 'WEB', requester: { id: o.requester.userId } });
    // Location is derived from the asset; path is rendered as a breadcrumb.
    expect(res.body.location.path).toBe('Science Block › Floor 2 › Lecture Hall 204');
    // HVAC category default checklist was copied onto the work order.
    expect(res.body.checklist.length).toBeGreaterThan(3);
    // SLA deadlines come from the HIGH policy (4h response, 24h resolution).
    const created = new Date(res.body.createdAt).getTime();
    expect(new Date(res.body.response.dueAt).getTime() - created).toBeGreaterThan(4 * 3600_000 - 5000);
    expect(res.body.availableActions).toEqual(['cancel']);
    woId = res.body.id;
    version = res.body.version;

    // The asset now needs attention, and managers were notified.
    const asset = await o.admin.client.get(`/assets/${o.assetId}`).expect(200);
    expect(asset.body.status).toBe('NEEDS_ATTENTION');
    const notes = await o.manager.client.get('/notifications').expect(200);
    expect(notes.body.data[0]).toMatchObject({ type: 'WORK_ORDER_CREATED', workOrderId: woId });
  });

  it('unassigned work is invisible to technicians and they cannot assign it', async () => {
    await o.tech.client.get(`/work-orders/${woId}`).expect(404);
    const res = await transition(o.tech, woId, { action: 'assign', expectedVersion: version, assigneeId: o.tech.userId });
    expect(res.status).toBe(404);
  });

  it('managers get explainable technician suggestions', async () => {
    const res = await o.manager.client.get(`/work-orders/${woId}/assignment-suggestions`).expect(200);
    expect(res.body[0]).toMatchObject({ userId: o.tech.userId, skillLevel: 3 });
    expect(res.body[0].reasons[0]).toContain('HVAC');
  });

  it('a manager assigns the technician', async () => {
    const res = await transition(o.manager, woId, { action: 'assign', expectedVersion: version, assigneeId: o.tech.userId }).expect(200);
    expect(res.body).toMatchObject({ status: 'ASSIGNED', assignee: { id: o.tech.userId } });
    version = res.body.version;
    const notes = await o.tech.client.get('/notifications').expect(200);
    expect(notes.body.data.some((n: { type: string }) => n.type === 'WORK_ORDER_ASSIGNED')).toBe(true);
  });

  it('assigning someone who is not a technician of this organization fails', async () => {
    const res = await transition(o.manager, woId, { action: 'reassign', expectedVersion: version, assigneeId: o.requester.userId });
    expect(res.status).toBe(404);
  });

  it('stale versions are rejected with VERSION_CONFLICT', async () => {
    const res = await transition(o.tech, woId, { action: 'start', expectedVersion: version - 1 }).expect(409);
    expect(res.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: version });
  });

  it('the technician starts work (response SLA clock stops)', async () => {
    const res = await transition(o.tech, woId, { action: 'start', expectedVersion: version }).expect(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.response.state).toBe('MET');
    expect(res.body.respondedAt).toBeTruthy();
    version = res.body.version;
  });

  it('cannot submit before the checklist and evidence are complete', async () => {
    const res = await transition(o.tech, woId, { action: 'submit_resolution', expectedVersion: version, notes: 'Replaced the capacitor.' }).expect(422);
    expect(res.body.code).toBe('SUBMISSION_INCOMPLETE');
    expect(res.body.reasons).toEqual(expect.arrayContaining(['CHECKLIST_INCOMPLETE', 'EVIDENCE_REQUIRED']));
  });

  let photoId: string;
  it('completes the checklist and uploads photo evidence (validated by content)', async () => {
    const wo = await o.tech.client.get(`/work-orders/${woId}`).expect(200);
    for (const item of wo.body.checklist) {
      await o.tech.client.put(`/work-orders/${woId}/checklist/${item.id}`, { completed: true }).expect(200);
    }
    // Idempotent set: repeating does not flip it back.
    const again = await o.tech.client.put(`/work-orders/${woId}/checklist/${wo.body.checklist[0].id}`, { completed: true }).expect(200);
    expect(again.body.completedAt).toBeTruthy();

    const disguised = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]); // a Windows executable named .png
    await o.tech.client.upload(`/work-orders/${woId}/attachments?kind=EVIDENCE`, 'file', disguised, 'photo.png', 'image/png').expect(415);

    const up = await o.tech.client.upload(`/work-orders/${woId}/attachments?kind=EVIDENCE`, 'file', await testPhoto(), 'after.png', 'image/png').expect(201);
    expect(up.body).toMatchObject({ kind: 'EVIDENCE', contentType: 'image/jpeg', width: 640, height: 480 });
    expect(up.body.thumbnailUrl).toContain('variant=thumb');
    photoId = up.body.id;

    const content = await o.requester.client.get(`/attachments/${photoId}/content`).expect(200);
    expect(content.headers['content-type']).toBe('image/jpeg');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
  });

  it('submits the resolution for verification', async () => {
    const res = await transition(o.tech, woId, {
      action: 'submit_resolution',
      expectedVersion: (await o.tech.client.get(`/work-orders/${woId}`)).body.version,
      notes: 'Replaced the run capacitor and cleaned the filters. Cooling restored to 22°C.',
      laborMinutes: 45,
      attachmentIds: [photoId],
    }).expect(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.submissions[0]).toMatchObject({ outcome: 'PENDING', laborMinutes: 45 });
    expect(res.body.submissions[0].attachments[0].id).toBe(photoId);
    expect(res.body.availableActions).toEqual([]); // the technician cannot verify their own work
    version = res.body.version;
  });

  it('the requester rejects with a reason → back to the technician as rework', async () => {
    const review = await o.requester.client.get(`/work-orders/${woId}`).expect(200);
    expect(review.body.availableActions).toEqual(['approve', 'reject']);
    const res = await transition(o.requester, woId, { action: 'reject', expectedVersion: version, reason: 'Still warm near the back rows.' }).expect(200);
    expect(res.body).toMatchObject({ status: 'IN_PROGRESS', reworkCount: 1 });
    expect(res.body.submissions[0]).toMatchObject({ outcome: 'REJECTED', reviewNote: 'Still warm near the back rows.' });
    version = res.body.version;
  });

  it('after rework, the requester approves → RESOLVED and the asset is operational again', async () => {
    const up = await o.tech.client.upload(`/work-orders/${woId}/attachments?kind=EVIDENCE`, 'file', await testPhoto('#16A34A'), 'after-2.png', 'image/png').expect(201);
    const sub = await transition(o.tech, woId, {
      action: 'submit_resolution',
      expectedVersion: version,
      notes: 'Adjusted the louvres and topped up refrigerant; back rows now 23°C.',
      attachmentIds: [up.body.id],
    }).expect(200);
    const res = await transition(o.requester, woId, { action: 'approve', expectedVersion: sub.body.version, note: 'Perfect, thanks!' }).expect(200);
    expect(res.body).toMatchObject({ status: 'RESOLVED' });
    expect(res.body.resolution.state).toBe('MET');
    expect(res.body.verifiedAt).toBeTruthy();
    version = res.body.version;
    const asset = await o.admin.client.get(`/assets/${o.assetId}`).expect(200);
    expect(asset.body.status).toBe('OPERATIONAL');
  });

  it('comments: internal notes are hidden from the requester', async () => {
    await o.requester.client.post(`/work-orders/${woId}/comments`, { body: 'Thanks team!' }).expect(201);
    await o.tech.client.post(`/work-orders/${woId}/comments`, { body: 'Capacitor part #C-45 used.', isInternal: true }).expect(201);
    await o.requester.client.post(`/work-orders/${woId}/comments`, { body: 'sneaky', isInternal: true }).expect(403);
    const mine = await o.requester.client.get(`/work-orders/${woId}/timeline`).expect(200);
    const staff = await o.manager.client.get(`/work-orders/${woId}/timeline`).expect(200);
    const comments = (t: { kind: string; body?: string }[]) => t.filter((e) => e.kind === 'comment').map((e) => e.body);
    expect(comments(mine.body)).toEqual(['Thanks team!']);
    expect(comments(staff.body)).toEqual(['Thanks team!', 'Capacitor part #C-45 used.']);
    const statuses = staff.body.filter((e: { kind: string }) => e.kind === 'status').map((e: { to: string }) => e.to);
    expect(statuses).toEqual(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'RESOLVED']);
  });

  it('close, then reopen within the window starts a new SLA cycle with the same technician', async () => {
    const closed = await transition(o.manager, woId, { action: 'close', expectedVersion: version }).expect(200);
    const reopened = await transition(o.requester, woId, { action: 'reopen', expectedVersion: closed.body.version, reason: 'Stopped cooling again.' }).expect(200);
    expect(reopened.body).toMatchObject({ status: 'ASSIGNED', assignee: { id: o.tech.userId }, slaCycle: 1, reopenCount: 1, respondedAt: null });
  });
});

describe('role rules', () => {
  it('requesters only see their own requests', async () => {
    const mine = await o.requester.client
      .post('/work-orders', { title: 'Projector flickers', priority: 'LOW', categoryId: o.categories['IT & AV'], locationId: o.roomId })
      .expect(201);
    await o.requester2.client.get(`/work-orders/${mine.body.id}`).expect(404);
    const list = await o.requester2.client.get('/work-orders').expect(200);
    expect(list.body.data.find((w: { id: string }) => w.id === mine.body.id)).toBeUndefined();
  });

  it('requesters cannot change priority or assign', async () => {
    const wo = await o.requester.client.post('/work-orders', { title: 'Door hinge loose', categoryId: o.categories.Carpentry, locationId: o.roomId }).expect(201);
    await o.requester.client.patch(`/work-orders/${wo.body.id}`, { expectedVersion: 1, priority: 'CRITICAL' }).expect(403);
    await o.requester.client.patch(`/work-orders/${wo.body.id}`, { expectedVersion: 1, title: 'Door hinge loose (room 204)' }).expect(200);
    const res = await transition(o.requester, wo.body.id, { action: 'assign', expectedVersion: 2, assigneeId: o.tech.userId }).expect(422);
    expect(res.body.code).toBe('WORKFLOW_DENIED');
  });

  it('technicians cannot read team or org settings; managers cannot change org settings', async () => {
    await o.tech.client.get('/members').expect(403);
    await o.manager.client.patch('/organizations/current', { name: 'Hijacked' }).expect(403);
    await o.manager.client.get('/members').expect(200);
    await o.admin.client.patch('/organizations/current/policy', { technicianSelfAssign: true }).expect(200);
  });

  it('with self-assign enabled, technicians see the open pool and can take a job', async () => {
    const wo = await o.requester.client.post('/work-orders', { title: 'Leaking tap', categoryId: o.categories.Plumbing, locationId: o.roomId }).expect(201);
    const pool = await o.tech2.client.get('/work-orders?status=OPEN').expect(200);
    expect(pool.body.data.some((w: { id: string }) => w.id === wo.body.id)).toBe(true);
    await transition(o.tech2, wo.body.id, { action: 'assign', expectedVersion: 1, assigneeId: o.tech.userId }).expect(422);
    await transition(o.tech2, wo.body.id, { action: 'assign', expectedVersion: 1, assigneeId: o.tech2.userId }).expect(200);
  });
});

describe('idempotent retries', () => {
  it('replays the original response for a repeated Idempotency-Key and creates only one record', async () => {
    const body = { title: 'Broken window latch', categoryId: o.categories.Carpentry, locationId: o.roomId };
    const first = await o.requester.client.post('/work-orders', body).set('Idempotency-Key', 'offline-abc-123456').expect(201);
    const second = await o.requester.client.post('/work-orders', body).set('Idempotency-Key', 'offline-abc-123456').expect(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
    const count = await h.db.system.workOrder.count({ where: { title: 'Broken window latch' } });
    expect(count).toBe(1);
    const reused = await o.requester.client.post('/work-orders', { ...body, title: 'Different' }).set('Idempotency-Key', 'offline-abc-123456').expect(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
