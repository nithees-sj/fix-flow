/**
 * Cross-tenant isolation — DATABASE LAYER (layer c of the isolation suite).
 * Runs as the real runtime role `fixflow_app` against the Dockerized test database and
 * proves that isolation holds even if application code forgets a filter.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, Prisma, isForeignKeyViolation, isRlsViolation } from '../src/index.js';
import { testUrls, truncateAll } from './helpers.js';

const urls = testUrls();
// Pool size 1 forces connection reuse, so leaked session settings would be observable.
const db = new Database({ appUrl: urls.app, systemUrl: urls.system, poolSize: 1 });

const token = () => randomBytes(16).toString('hex');

interface Tenant {
  orgId: string;
  userId: string;
  otherUserId: string;
  categoryId: string;
  locationId: string;
  assetId: string;
  workOrderId: string;
}

async function seedTenant(name: string): Promise<Tenant> {
  const s = db.system;
  const org = await s.organization.create({
    data: { name, slug: `${name.toLowerCase()}-${token().slice(0, 6)}`, industry: 'EDUCATION', timezone: 'UTC' },
  });
  const user = await s.user.create({ data: { email: `admin-${token()}@${name.toLowerCase()}.test`, name: `${name} Admin`, passwordHash: 'x' } });
  const other = await s.user.create({ data: { email: `req-${token()}@${name.toLowerCase()}.test`, name: `${name} Requester`, passwordHash: 'x' } });
  await s.membership.createMany({
    data: [
      { organizationId: org.id, userId: user.id, role: 'ORG_ADMIN' },
      { organizationId: org.id, userId: other.id, role: 'REQUESTER' },
    ],
  });
  const category = await s.category.create({ data: { organizationId: org.id, name: 'HVAC' } });
  const location = await s.location.create({
    data: { organizationId: org.id, type: 'BUILDING', name: `${name} Main`, publicReportToken: token() },
  });
  const asset = await s.asset.create({
    data: {
      organizationId: org.id,
      locationId: location.id,
      categoryId: category.id,
      name: 'Rooftop unit',
      assetTag: 'HVAC-001',
      publicReportToken: token(),
    },
  });
  const now = new Date();
  const wo = await s.workOrder.create({
    data: {
      organizationId: org.id,
      number: 1,
      title: `${name} AC broken`,
      categoryId: category.id,
      assetId: asset.id,
      locationId: location.id,
      requesterId: other.id,
      responseDueAt: now,
      resolutionDueAt: now,
    },
  });
  await s.notification.create({
    data: { organizationId: org.id, userId: other.id, type: 'WORK_ORDER_CREATED', title: 't', body: 'b', dedupeKey: token() },
  });
  return {
    orgId: org.id,
    userId: user.id,
    otherUserId: other.id,
    categoryId: category.id,
    locationId: location.id,
    assetId: asset.id,
    workOrderId: wo.id,
  };
}

let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  await truncateAll();
  A = await seedTenant('Alpha');
  B = await seedTenant('Bravo');
});

afterAll(async () => {
  await db.disconnect();
});

const ctxA = () => ({ organizationId: A.orgId, userId: A.userId });

describe('fail closed', () => {
  it('the app role sees no tenant rows without a tenant context', async () => {
    expect(await db.app.workOrder.count()).toBe(0);
    expect(await db.app.asset.findMany()).toEqual([]);
    const raw = await db.app.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM work_orders`;
    expect(Number(raw[0]!.n)).toBe(0);
  });

  it('tenant settings are transaction-local and never leak through pooled connections', async () => {
    await db.tx(ctxA(), async (tx) => {
      expect(await tx.workOrder.count()).toBe(1);
    });
    // Same single pooled connection, no context → nothing visible again.
    expect(await db.app.workOrder.count()).toBe(0);
  });

  it('rejects a malformed context before touching the database', async () => {
    await expect(db.tx({ organizationId: "x' OR 1=1 --", userId: null }, async () => 1)).rejects.toThrow(/not a UUID/);
  });
});

describe('reads are confined to the current organization', () => {
  it('ORM queries, relations and aggregates only see the tenant', async () => {
    await db.tx(ctxA(), async (tx) => {
      const all = await tx.workOrder.findMany({ include: { asset: true, category: true } });
      expect(all.map((w) => w.organizationId)).toEqual([A.orgId]);
      expect(await tx.workOrder.findUnique({ where: { id: B.workOrderId } })).toBeNull();
      expect(await tx.asset.findFirst({ where: { id: B.assetId } })).toBeNull();
      const grouped = await tx.workOrder.groupBy({ by: ['organizationId'], _count: true });
      expect(grouped).toHaveLength(1);
    });
  });

  it('raw SQL is filtered by RLS even without a WHERE clause', async () => {
    await db.tx(ctxA(), async (tx) => {
      const rows = await tx.$queryRaw<{ organization_id: string }[]>(
        Prisma.sql`SELECT organization_id FROM work_orders UNION ALL SELECT organization_id FROM assets`,
      );
      expect(new Set(rows.map((r) => r.organization_id))).toEqual(new Set([A.orgId]));
    });
  });

  it('users from other organizations are invisible; members are visible', async () => {
    await db.tx(ctxA(), async (tx) => {
      expect(await tx.user.findUnique({ where: { id: B.userId } })).toBeNull();
      expect(await tx.user.findUnique({ where: { id: A.otherUserId } })).not.toBeNull();
    });
  });

  it('organizations: only the active one plus the user’s own memberships', async () => {
    await db.tx(ctxA(), async (tx) => {
      const orgs = await tx.organization.findMany();
      expect(orgs.map((o) => o.id)).toEqual([A.orgId]);
    });
  });

  it('notifications are readable only by their recipient', async () => {
    await db.tx({ organizationId: A.orgId, userId: A.userId }, async (tx) => {
      expect(await tx.notification.count()).toBe(0); // belongs to A.otherUser
    });
    await db.tx({ organizationId: A.orgId, userId: A.otherUserId }, async (tx) => {
      expect(await tx.notification.count()).toBe(1);
    });
  });
});

describe('writes cannot cross tenants', () => {
  it('WITH CHECK rejects inserting a row owned by another organization', async () => {
    const err = await db
      .tx(ctxA(), (tx) => tx.category.create({ data: { organizationId: B.orgId, name: 'Smuggled' } }))
      .catch((e: unknown) => e);
    expect(isRlsViolation(err)).toBe(true);
  });

  it('WITH CHECK rejects moving a row to another organization', async () => {
    const err = await db
      .tx(ctxA(), (tx) => tx.category.update({ where: { id: A.categoryId }, data: { organizationId: B.orgId } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
  });

  it('updates and deletes of other tenants’ rows affect nothing', async () => {
    await db.tx(ctxA(), async (tx) => {
      const u = await tx.workOrder.updateMany({ where: { id: B.workOrderId }, data: { title: 'pwned' } });
      const d = await tx.asset.deleteMany({ where: { id: B.assetId } });
      expect([u.count, d.count]).toEqual([0, 0]);
    });
    const untouched = await db.system.workOrder.findUniqueOrThrow({ where: { id: B.workOrderId } });
    expect(untouched.title).toBe('Bravo AC broken');
  });

  it('composite foreign keys reject references to another tenant’s parent rows', async () => {
    const now = new Date();
    const err = await db
      .tx(ctxA(), (tx) =>
        tx.workOrder.create({
          data: {
            organizationId: A.orgId,
            number: 99,
            title: 'Points at Bravo asset',
            categoryId: A.categoryId,
            assetId: B.assetId, // ← another tenant's asset
            requesterId: A.otherUserId,
            responseDueAt: now,
            resolutionDueAt: now,
          },
        }),
      )
      .catch((e: unknown) => e);
    expect(isForeignKeyViolation(err)).toBe(true);
  });

  it('composite foreign keys reject assigning a user who is not a member of the tenant', async () => {
    const err = await db
      .tx(ctxA(), (tx) => tx.workOrder.update({ where: { id: A.workOrderId }, data: { assigneeId: B.userId, status: 'ASSIGNED' } }))
      .catch((e: unknown) => e);
    expect(isForeignKeyViolation(err)).toBe(true);
  });

  it('the system role is the only path that sees every tenant (audited use only)', async () => {
    expect(await db.system.workOrder.count()).toBe(2);
  });
});

describe('user-scoped data', () => {
  it('a user lists their own memberships across organizations, nobody else’s', async () => {
    const shared = await db.system.user.create({ data: { email: `multi-${token()}@test.dev`, name: 'Multi', passwordHash: 'x' } });
    await db.system.membership.createMany({
      data: [
        { organizationId: A.orgId, userId: shared.id, role: 'MANAGER' },
        { organizationId: B.orgId, userId: shared.id, role: 'TECHNICIAN' },
      ],
    });
    const mine = await db.userTx(shared.id, (tx) => tx.membership.findMany({ include: { organization: true } }));
    expect(mine.map((m) => m.organization.name).sort()).toEqual(['Alpha', 'Bravo']);
  });

  it('sessions of other users are invisible', async () => {
    await db.system.session.create({
      data: {
        userId: B.userId,
        familyId: randomUUID(),
        refreshTokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 1e6),
      },
    });
    expect(await db.userTx(A.userId, (tx) => tx.session.count())).toBe(0);
  });
});

describe('business invariants enforced by CHECK constraints', () => {
  it('assigned work must have an assignee', async () => {
    await expect(
      db.tx(ctxA(), (tx) => tx.workOrder.update({ where: { id: A.workOrderId }, data: { status: 'IN_PROGRESS' } })),
    ).rejects.toThrow();
  });

  it('emails must be stored lowercase', async () => {
    await expect(db.system.user.create({ data: { email: 'Mixed@Case.test', name: 'X', passwordHash: 'x' } })).rejects.toThrow();
  });
});
