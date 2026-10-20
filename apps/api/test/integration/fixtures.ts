import sharp from 'sharp';
import type { Role } from '@fixflow/shared';
import { Client, registerUser, type Harness } from './harness.js';

export interface Member {
  client: Client;
  userId: string;
  email: string;
}

export interface OrgFixture {
  orgId: string;
  admin: Member;
  manager: Member;
  tech: Member;
  tech2: Member;
  requester: Member;
  requester2: Member;
  categories: Record<string, string>;
  buildingId: string;
  roomId: string;
  assetId: string;
}

/** Adds an existing user to an org (fast path for tests) and activates it on their session. */
async function join(h: Harness, orgId: string, m: Member, role: Role): Promise<void> {
  await h.db.system.membership.create({ data: { organizationId: orgId, userId: m.userId, role } });
  const res = await m.client.post('/auth/switch-organization', { organizationId: orgId });
  if (res.status !== 200) throw new Error(`switch failed ${res.status} ${JSON.stringify(res.body)}`);
}

/** A complete organization: people in every role, the default catalog, a building, a room and an asset. */
export async function createOrg(h: Harness, name = 'Northbridge Institute'): Promise<OrgFixture> {
  const admin = await registerUser(h, `${name} Admin`);
  const created = await admin.client.post('/organizations', { name, industry: 'EDUCATION', timezone: 'Asia/Kolkata' });
  if (created.status !== 201) throw new Error(`org create failed ${created.status} ${JSON.stringify(created.body)}`);
  const orgId = created.body.organization.id as string;

  const [manager, tech, tech2, requester, requester2] = await Promise.all([
    registerUser(h, `${name} Manager`),
    registerUser(h, `${name} Tech`),
    registerUser(h, `${name} Tech Two`),
    registerUser(h, `${name} Requester`),
    registerUser(h, `${name} Requester Two`),
  ]);
  await join(h, orgId, manager, 'MANAGER');
  await join(h, orgId, tech, 'TECHNICIAN');
  await join(h, orgId, tech2, 'TECHNICIAN');
  await join(h, orgId, requester, 'REQUESTER');
  await join(h, orgId, requester2, 'REQUESTER');

  const cats = await admin.client.get('/categories').expect(200);
  const categories = Object.fromEntries((cats.body as { name: string; id: string }[]).map((c) => [c.name, c.id]));

  const building = await admin.client.post('/locations', { name: 'Science Block', type: 'BUILDING', parentId: null }).expect(201);
  const floor = await admin.client.post('/locations', { name: 'Floor 2', type: 'FLOOR', parentId: building.body.id }).expect(201);
  const room = await admin.client.post('/locations', { name: 'Lecture Hall 204', type: 'ROOM', parentId: floor.body.id, code: 'SB-204' }).expect(201);
  const asset = await admin.client
    .post('/assets', { name: 'Split AC unit', assetTag: `HVAC-${Math.floor(Math.random() * 1e6)}`, categoryId: categories.HVAC, locationId: room.body.id })
    .expect(201);

  // Give the first technician the HVAC skill so suggestions/auto-assign have signal.
  const techMembership = await h.db.system.membership.findFirstOrThrow({ where: { organizationId: orgId, userId: tech.userId } });
  await admin.client.put(`/members/${techMembership.id}/skills`, { skills: [{ categoryId: categories.HVAC, level: 3 }] }).expect(200);

  return { orgId, admin, manager, tech, tech2, requester, requester2, categories, buildingId: building.body.id, roomId: room.body.id, assetId: asset.body.id };
}

export async function testPhoto(color = '#2563EB'): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).png().toBuffer();
}
