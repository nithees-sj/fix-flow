/**
 * Analytics correctness against a hand-computed fixture.
 *
 * Work orders are inserted with exact timestamps so every expected number below can be
 * derived by hand. The organization runs on Asia/Kolkata (UTC+05:30), which makes day
 * buckets differ from UTC buckets — W1 is created on Sep 1 UTC but Sep 2 local.
 *
 * Range: 2026-09-01 00:00 → 2026-09-10 23:59:59.999 (Asia/Kolkata).
 *
 *  #   created (UTC)   prio      status       assignee  responded  submitted  resolved     notes
 *  W1  09-01 20:00     HIGH      RESOLVED     tech      +60m ✓     +10h ✓     09-02 08:00  asset
 *  W2  09-03 04:00     MEDIUM    CLOSED       tech      +600m ✗    +80h ✗     09-06 14:00  asset, rework 1
 *  W3  09-05 10:00     CRITICAL  IN_PROGRESS  tech2     +30m ✓     —  (due passed ✗)       asset, SCHEDULED source
 *  W4  09-08 06:00     LOW       OPEN         —         — ✗        —  ✗                    Plumbing
 *  W5  09-09 12:00     MEDIUM    CANCELLED    —                                            Plumbing; excluded from SLA
 *  W6  08-20 10:00     HIGH      CLOSED       tech2     08-20 ✓    09-04 09:00 ✗  09-04 10:00  created before range
 *  X1  another organization, inside the range — must never be counted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrg, type OrgFixture } from './fixtures.js';
import { resetState, startHarness, type Harness } from './harness.js';

let h: Harness;
let o: OrgFixture;
let other: OrgFixture;

const FROM = '2026-08-31T18:30:00.000Z';
const TO = '2026-09-10T18:29:59.999Z';
const at = (iso: string) => new Date(iso);
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

const SLA = { CRITICAL: [60, 240], HIGH: [240, 1440], MEDIUM: [480, 4320], LOW: [1440, 10080] } as const;

interface Spec {
  number: number;
  created: string;
  priority: keyof typeof SLA;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
  assignee?: 'tech' | 'tech2';
  respondedMin?: number;
  submitted?: string;
  resolved?: string;
  category?: 'HVAC' | 'Plumbing';
  onAsset?: boolean;
  source?: 'WEB' | 'SCHEDULED';
  rework?: number;
}

async function insert(f: OrgFixture, s: Spec): Promise<void> {
  const created = at(s.created);
  const [resp, resol] = SLA[s.priority];
  await h.db.system.workOrder.create({
    data: {
      organizationId: f.orgId,
      number: s.number,
      title: `Fixture WO ${s.number}`,
      priority: s.priority,
      status: s.status,
      source: s.source ?? 'WEB',
      categoryId: f.categories[s.category ?? 'HVAC']!,
      locationId: f.roomId,
      assetId: s.onAsset ? f.assetId : null,
      requesterId: f.requester.userId,
      assigneeId: s.assignee ? f[s.assignee].userId : null,
      createdAt: created,
      cycleStartedAt: created,
      responseDueAt: plus(created, resp),
      resolutionDueAt: plus(created, resol),
      respondedAt: s.respondedMin === undefined ? null : plus(created, s.respondedMin),
      resolutionSubmittedAt: s.submitted ? at(s.submitted) : null,
      resolvedAt: s.resolved ? at(s.resolved) : null,
      closedAt: s.status === 'CLOSED' && s.resolved ? plus(at(s.resolved), 1440) : null,
      cancelledAt: s.status === 'CANCELLED' ? plus(created, 30) : null,
      reworkCount: s.rework ?? 0,
    },
  });
}

beforeAll(async () => {
  h = await startHarness();
  await resetState(h);
  o = await createOrg(h, 'Analytics Institute');
  other = await createOrg(h, 'Other Clinic');

  await insert(o, { number: 101, created: '2026-09-01T20:00:00Z', priority: 'HIGH', status: 'RESOLVED', assignee: 'tech', respondedMin: 60, submitted: '2026-09-02T06:00:00Z', resolved: '2026-09-02T08:00:00Z', onAsset: true });
  await insert(o, { number: 102, created: '2026-09-03T04:00:00Z', priority: 'MEDIUM', status: 'CLOSED', assignee: 'tech', respondedMin: 600, submitted: '2026-09-06T12:00:00Z', resolved: '2026-09-06T14:00:00Z', onAsset: true, rework: 1 });
  await insert(o, { number: 103, created: '2026-09-05T10:00:00Z', priority: 'CRITICAL', status: 'IN_PROGRESS', assignee: 'tech2', respondedMin: 30, onAsset: true, source: 'SCHEDULED' });
  await insert(o, { number: 104, created: '2026-09-08T06:00:00Z', priority: 'LOW', status: 'OPEN', category: 'Plumbing' });
  await insert(o, { number: 105, created: '2026-09-09T12:00:00Z', priority: 'MEDIUM', status: 'CANCELLED', category: 'Plumbing' });
  await insert(o, { number: 106, created: '2026-08-20T10:00:00Z', priority: 'HIGH', status: 'CLOSED', assignee: 'tech2', respondedMin: 60, submitted: '2026-09-04T09:00:00Z', resolved: '2026-09-04T10:00:00Z' });
  // Another tenant's data inside the same range: must not move any number.
  await insert(other, { number: 101, created: '2026-09-02T05:00:00Z', priority: 'HIGH', status: 'RESOLVED', assignee: 'tech', respondedMin: 10, submitted: '2026-09-02T07:00:00Z', resolved: '2026-09-02T08:00:00Z', onAsset: true });
});
afterAll(async () => h.close());

const query = `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;
const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'];

describe('analytics report', () => {
  let r: Awaited<ReturnType<typeof fetchReport>>;
  const fetchReport = async () => (await o.manager.client.get(`/analytics/report?${query}`).expect(200)).body;
  beforeAll(async () => {
    r = await fetchReport();
  });

  it('uses daily buckets in the organization time zone', () => {
    expect(r.granularity).toBe('day');
    expect(r.trend.map((t: { bucket: string }) => t.bucket)).toEqual(days);
  });

  it('distributes work orders created in range by status, priority and category', () => {
    const status = Object.fromEntries(r.statusDistribution.map((s: { status: string; count: number }) => [s.status, s.count]));
    expect(status).toEqual({ RESOLVED: 1, CLOSED: 1, IN_PROGRESS: 1, OPEN: 1, CANCELLED: 1 });
    expect(r.priorityDistribution).toEqual([
      { priority: 'CRITICAL', count: 1 },
      { priority: 'HIGH', count: 1 },
      { priority: 'MEDIUM', count: 2 },
      { priority: 'LOW', count: 1 },
    ]);
    expect(r.categoryDistribution.map((c: { name: string; count: number }) => [c.name, c.count])).toEqual([
      ['HVAC', 3],
      ['Plumbing', 2],
    ]);
  });

  it('trends created/resolved per local day with average resolution minutes', () => {
    const byDay = Object.fromEntries(r.trend.map((t: { bucket: string }) => [t.bucket, t]));
    // W1 was created 20:00 UTC Sep 1 = 01:30 Sep 2 in Kolkata.
    expect(byDay['2026-09-01']).toMatchObject({ created: 0, resolved: 0, avgResolutionMinutes: null });
    expect(byDay['2026-09-02']).toMatchObject({ created: 1, resolved: 1, avgResolutionMinutes: 600 });
    expect(byDay['2026-09-03']).toMatchObject({ created: 1, resolved: 0 });
    // W6 was created before the range but resolved inside it.
    expect(byDay['2026-09-04']).toMatchObject({ created: 0, resolved: 1, avgResolutionMinutes: 21_540 });
    expect(byDay['2026-09-05']).toMatchObject({ created: 1, resolved: 0 });
    expect(byDay['2026-09-06']).toMatchObject({ created: 0, resolved: 1, avgResolutionMinutes: 4_800 });
    expect(byDay['2026-09-08']).toMatchObject({ created: 1 });
    expect(byDay['2026-09-09']).toMatchObject({ created: 1 });
    const totalCreated = r.trend.reduce((n: number, t: { created: number }) => n + t.created, 0);
    expect(totalCreated).toBe(5);
  });

  it('counts SLA outcomes per creation day, excluding cancelled work', () => {
    const sla = Object.fromEntries(r.sla.map((s: { bucket: string }) => [s.bucket, s]));
    expect(sla['2026-09-02']).toEqual({ bucket: '2026-09-02', responseMet: 1, responseMissed: 0, resolutionMet: 1, resolutionMissed: 0 });
    expect(sla['2026-09-03']).toEqual({ bucket: '2026-09-03', responseMet: 0, responseMissed: 1, resolutionMet: 0, resolutionMissed: 1 });
    expect(sla['2026-09-05']).toEqual({ bucket: '2026-09-05', responseMet: 1, responseMissed: 0, resolutionMet: 0, resolutionMissed: 1 });
    expect(sla['2026-09-08']).toEqual({ bucket: '2026-09-08', responseMet: 0, responseMissed: 1, resolutionMet: 0, resolutionMissed: 1 });
    expect(sla['2026-09-09']).toEqual({ bucket: '2026-09-09', responseMet: 0, responseMissed: 0, resolutionMet: 0, resolutionMissed: 0 });
  });

  it('computes SLA rates per priority', () => {
    expect(r.slaByPriority).toEqual([
      { priority: 'CRITICAL', responseRate: 1, resolutionRate: 0, total: 1 },
      { priority: 'HIGH', responseRate: 1, resolutionRate: 1, total: 1 },
      { priority: 'MEDIUM', responseRate: 0, resolutionRate: 0, total: 1 },
      { priority: 'LOW', responseRate: 0, resolutionRate: 0, total: 1 },
    ]);
  });

  it('scores technicians on work resolved in range', () => {
    const t = r.technicians.filter((x: { completed: number; open: number }) => x.completed > 0 || x.open > 0);
    expect(t).toEqual([
      { userId: o.tech.userId, name: 'Analytics Institute Tech', completed: 2, open: 0, avgResolutionMinutes: 2_700, slaMetRate: 0.5, reworkRate: 0.5 },
      { userId: o.tech2.userId, name: 'Analytics Institute Tech Two', completed: 1, open: 1, avgResolutionMinutes: 21_540, slaMetRate: 0, reworkRate: 0 },
    ]);
  });

  it('ranks asset failures, ignoring scheduled maintenance', () => {
    expect(r.assetFailures).toHaveLength(1);
    expect(r.assetFailures[0]).toMatchObject({ assetId: o.assetId, failures: 2, location: 'Lecture Hall 204', lastFailureAt: '2026-09-03T04:00:00.000Z' });
  });

  it('is restricted to analytics roles', async () => {
    await o.tech.client.get(`/analytics/report?${query}`).expect(403);
    await o.requester.client.get(`/analytics/report?${query}`).expect(403);
  });
});

describe('dashboard', () => {
  it('summarizes the organization for managers', async () => {
    const d = (await o.manager.client.get(`/dashboard?${query}`).expect(200)).body;
    expect(d.totals).toEqual({ total: 5, open: 1, inProgress: 1, pendingVerification: 0, resolved: 3, overdue: 2 });
    // Responses inside the range: W1 60, W2 600, W3 30 → 230. Resolutions: W1 600, W2 4800, W6 21540 → 8980.
    expect(d.avgResponseMinutes).toBe(230);
    expect(d.avgResolutionMinutes).toBe(8_980);
    // W1–W4: response met 2/4; resolution met 1/4; overall 3/8.
    expect(d.slaCompliance).toEqual({ response: 0.5, resolution: 0.25, overall: 0.375 });
    expect(d.byPriority).toEqual([
      { priority: 'CRITICAL', open: 1, total: 1 },
      { priority: 'HIGH', open: 0, total: 1 },
      { priority: 'MEDIUM', open: 0, total: 2 },
      { priority: 'LOW', open: 1, total: 1 },
    ]);
    const volume = Object.fromEntries(d.volume.map((v: { date: string; created: number; resolved: number }) => [v.date, [v.created, v.resolved]]));
    expect(volume['2026-09-01']).toEqual([0, 0]);
    expect(volume['2026-09-02']).toEqual([1, 1]);
    expect(volume['2026-09-04']).toEqual([0, 1]);
  });

  it('scopes technicians to their own jobs', async () => {
    const d = (await o.tech.client.get(`/dashboard?${query}`).expect(200)).body;
    expect(d.totals).toMatchObject({ total: 2, open: 0, inProgress: 0, resolved: 2, overdue: 0 });
    expect(d.technicianWorkload.map((w: { userId: string }) => w.userId)).toEqual([o.tech.userId]);
  });

  it('scopes requesters to their own requests', async () => {
    const d = (await o.requester2.client.get(`/dashboard?${query}`).expect(200)).body;
    expect(d.totals).toEqual({ total: 0, open: 0, inProgress: 0, pendingVerification: 0, resolved: 0, overdue: 0 });
  });
});

describe('CSV export', () => {
  it('exports exactly this organization’s work orders with SLA verdicts', async () => {
    const res = await o.manager.client.get(`/analytics/export.csv?${query}`).buffer(true).parse((r, cb) => {
      let s = '';
      r.on('data', (c: Buffer) => (s += c.toString()));
      r.on('end', () => cb(null, s));
    }).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = (res.body as string).replace(/^\uFEFF/, '').trim().split('\n');
    expect(lines).toHaveLength(1 + 5); // header + W1–W5 (W6 created earlier, X1 other tenant)
    expect(lines[1]).toMatch(/^WO-0*101,Fixture WO 101,Resolved,High,HVAC,.*,Met,Met,0\r?$/);
    expect(lines[2]).toMatch(/^WO-0*102,.*,Missed,Missed,1\r?$/);
    expect(lines[5]).toMatch(/^WO-0*105,.*,Cancelled,.*,,,0\r?$/);
    expect(res.body).not.toContain('Other Clinic');
  });
});
