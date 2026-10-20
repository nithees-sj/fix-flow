/**
 * Demo seed — LOCAL DEVELOPMENT ONLY.
 *
 *   pnpm db:seed                 create demo organizations that do not exist yet (idempotent)
 *   SEED_RESET=true pnpm db:seed delete and recreate the three DEMO organizations only
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_DEMO_SEED=true.
 * Work orders are produced by simulating the real lifecycle (shared state machine + SLA math),
 * so history, assignments, submissions, SLA events and analytics stay consistent.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { hash } from '@node-rs/argon2';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import sharp from 'sharp';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CHECKLISTS,
  DEFAULT_SLA_TARGETS,
  PRIORITIES,
  STATUS_META,
  formatWorkOrderNumber,
  nextOccurrenceAfter,
  occurrence,
  type Priority,
} from '@fixflow/shared';
import { Database } from '../src/database.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { BLUEPRINTS, DEMO_PASSWORD, type LocationSpec, type OrgBlueprint } from './blueprints.js';
import { Rng } from './rng.js';
import { simulate, type SimPeople } from './simulate.js';

const rootEnv = resolve(import.meta.dirname, '../../../../.env');
const rootEnvSrc = resolve(import.meta.dirname, '../../../.env');
for (const f of [rootEnv, rootEnvSrc]) if (existsSync(f)) expand(dotenv.config({ path: f, quiet: true }));

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true to override).');
  process.exit(1);
}
const RESET = process.env.SEED_RESET === 'true';
const DAY = 86_400_000;
const token = () => randomBytes(18).toString('base64url');

const db = new Database({ appUrl: process.env.DATABASE_URL!, systemUrl: process.env.DATABASE_SYSTEM_URL!, poolSize: 4 });
const s: PrismaClient = db.system;

const s3 =
  process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY
    ? new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
      })
    : null;
const bucket = process.env.S3_BUCKET ?? 'fixflow-private';

/** Working-hours-weighted random instant within the last `days` days (org local time ≈ UTC offset ignored). */
function pastInstant(rng: Rng, now: Date, days: number): Date {
  const daysAgo = rng.next() ** 1.7 * days;
  const base = new Date(now.getTime() - daysAgo * DAY);
  const d = new Date(base);
  const hour = rng.weighted([
    [3, 1], [5, 2], [7, 6], [9, 10], [11, 10], [13, 8], [15, 8], [17, 5], [19, 2], [21, 1],
  ] as const);
  d.setUTCHours(hour, rng.int(0, 59), rng.int(0, 59), 0);
  return d.getTime() > now.getTime() ? new Date(now.getTime() - rng.int(5, 240) * 60_000) : d;
}

async function deleteOrg(orgId: string): Promise<void> {
  const where = { organizationId: orgId };
  await s.notification.deleteMany({ where });
  await s.notificationPreference.deleteMany({ where });
  await s.slaEvent.deleteMany({ where });
  await s.attachment.deleteMany({ where });
  await s.resolutionSubmission.deleteMany({ where });
  await s.workOrderChecklistItem.deleteMany({ where });
  await s.workOrderComment.deleteMany({ where });
  await s.workOrderStatusHistory.deleteMany({ where });
  await s.workOrderAssignment.deleteMany({ where });
  await s.workOrder.deleteMany({ where });
  await s.maintenanceSchedule.deleteMany({ where });
  await s.asset.deleteMany({ where });
  await s.location.updateMany({ where, data: { parentId: null } });
  await s.location.deleteMany({ where });
  await s.technicianSkill.deleteMany({ where });
  await s.category.updateMany({ where, data: { defaultChecklistTemplateId: null } });
  await s.category.deleteMany({ where });
  await s.checklistTemplateItem.deleteMany({ where });
  await s.checklistTemplate.deleteMany({ where });
  await s.invitation.deleteMany({ where });
  await s.slaPolicy.deleteMany({ where });
  await s.auditLog.deleteMany({ where });
  await s.idempotencyRecord.deleteMany({ where });
  await s.emailDelivery.deleteMany({ where });
  await s.outboxEvent.deleteMany({ where });
  await s.membership.deleteMany({ where });
  await s.session.updateMany({ where: { activeOrganizationId: orgId }, data: { activeOrganizationId: null } });
  await s.organization.delete({ where: { id: orgId } });
}

async function ensureBucket(): Promise<boolean> {
  if (!s3) return false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      return false;
    }
  }
  return true;
}

/** An abstract "after repair" image (no text so it renders without system fonts). */
async function evidenceImage(rng: Rng): Promise<{ full: Buffer; thumb: Buffer }> {
  const hue = rng.pick(['#DBEAFE', '#DCFCE7', '#E0F2FE', '#F1F5F9', '#FEF3C7']);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hue}"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs>
    <rect width="1280" height="960" fill="url(#g)"/>
    <rect x="250" y="210" width="780" height="540" rx="36" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="6"/>
    <rect x="320" y="290" width="420" height="40" rx="20" fill="#E2E8F0"/>
    <rect x="320" y="360" width="300" height="40" rx="20" fill="#E2E8F0"/>
    <circle cx="880" cy="560" r="110" fill="#16A34A"/>
    <path d="M825 562l38 38 76-86" stroke="#FFFFFF" stroke-width="26" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const img = sharp(Buffer.from(svg));
  return {
    full: await img.clone().jpeg({ quality: 80 }).toBuffer(),
    thumb: await img.clone().resize(480, 480, { fit: 'cover' }).webp({ quality: 70 }).toBuffer(),
  };
}

async function seedOrg(bp: OrgBlueprint, passwordHash: string, canUpload: boolean): Promise<void> {
  const existing = await s.organization.findUnique({ where: { slug: bp.slug } });
  if (existing && !RESET) {
    console.log(`  • ${bp.name}: already present — skipped (SEED_RESET=true to recreate)`);
    return;
  }
  if (existing) await deleteOrg(existing.id);

  const rng = new Rng(bp.seed);
  const now = new Date();
  const orgId = randomUUID();

  // People (users are global; the shared consultant belongs to several organizations).
  const userIds = new Map<string, string>();
  for (const p of bp.people) {
    const u = await s.user.upsert({
      where: { email: p.email },
      create: { email: p.email, name: p.name, passwordHash, emailVerifiedAt: now, lastLoginAt: new Date(now.getTime() - rng.int(1, 72) * 3_600_000) },
      update: {},
      select: { id: true },
    });
    userIds.set(p.email, u.id);
  }

  await s.organization.create({
    data: {
      id: orgId,
      name: bp.name,
      slug: bp.slug,
      industry: bp.industry,
      timezone: bp.timezone,
      onboardingCompletedAt: new Date(now.getTime() - 130 * DAY),
      createdAt: new Date(now.getTime() - 130 * DAY),
      ...bp.policy,
    },
  });

  // Catalog: SLA policies, checklist templates, categories (same defaults as a new organization).
  await s.slaPolicy.createMany({
    data: PRIORITIES.map((priority) => ({ organizationId: orgId, priority, ...pickTargets(priority) })),
  });
  const templateIds = new Map<string, string>();
  const templateItems = new Map<string, { label: string; required: boolean }[]>();
  for (const [name, t] of Object.entries(DEFAULT_CHECKLISTS)) {
    const id = randomUUID();
    await s.checklistTemplate.create({ data: { id, organizationId: orgId, name, description: t.description } });
    await s.checklistTemplateItem.createMany({
      data: t.items.map((it, i) => ({ organizationId: orgId, templateId: id, label: it.label, required: it.required, sortOrder: i })),
    });
    templateIds.set(name, id);
    templateItems.set(name, t.items);
  }
  const categoryIds = new Map<string, string>();
  const categoryTemplate = new Map<string, string | undefined>();
  for (const c of DEFAULT_CATEGORIES) {
    const id = randomUUID();
    await s.category.create({
      data: { id, organizationId: orgId, name: c.name, description: c.description, color: c.color, icon: c.icon, defaultChecklistTemplateId: c.checklist ? templateIds.get(c.checklist) : null },
    });
    categoryIds.set(c.name, id);
    categoryTemplate.set(c.name, c.checklist);
  }

  // Memberships & skills
  const people: SimPeople = { managers: [], technicians: [], requesters: [] };
  for (const p of bp.people) {
    const userId = userIds.get(p.email)!;
    const m = await s.membership.create({
      data: { organizationId: orgId, userId, role: p.role, jobTitle: p.jobTitle, isAvailable: p.available ?? true, createdAt: new Date(now.getTime() - rng.int(100, 129) * DAY) },
    });
    if (p.role === 'MANAGER' || p.role === 'ORG_ADMIN') people.managers.push(userId);
    if (p.role === 'TECHNICIAN') {
      const skills = new Map((p.skills ?? []).map(([c, l]) => [c, l]));
      people.technicians.push({ id: userId, skills, available: p.available ?? true });
      if (p.skills?.length) {
        await s.technicianSkill.createMany({
          data: p.skills.map(([c, level]) => ({ organizationId: orgId, membershipId: m.id, categoryId: categoryIds.get(c)!, level })),
        });
      }
    }
    if (p.role === 'REQUESTER') people.requesters.push(userId);
  }

  // Locations (tree)
  const locationIds = new Map<string, string>();
  const leafRooms: string[] = [];
  const createLocation = async (spec: LocationSpec, parentId: string | null) => {
    const id = randomUUID();
    // Blueprint floor keys are "Building · Floor" for uniqueness; the stored name is just the floor.
    const display = spec.type === 'FLOOR' && spec.name.includes(' · ') ? spec.name.split(' · ')[1]! : spec.name;
    await s.location.create({ data: { id, organizationId: orgId, parentId, type: spec.type, name: display, code: spec.code, publicReportToken: token() } });
    locationIds.set(spec.name, id);
    if (spec.type === 'ROOM' || spec.type === 'AREA') leafRooms.push(id);
    for (const child of spec.children ?? []) await createLocation(child, id);
  };
  for (const l of bp.locations) await createLocation(l, null);

  // Assets
  const assets: { id: string; tag: string; category: string; locationId: string }[] = [];
  for (const a of bp.assets) {
    const id = randomUUID();
    const locationId = locationIds.get(a.location)!;
    await s.asset.create({
      data: {
        id,
        organizationId: orgId,
        name: a.name,
        assetTag: a.tag,
        categoryId: categoryIds.get(a.category)!,
        locationId,
        manufacturer: a.manufacturer,
        model: a.model,
        serialNumber: `SN-${rng.int(100000, 999999)}`,
        installDate: new Date(now.getTime() - rng.int(300, 2500) * DAY),
        warrantyExpiresAt: new Date(now.getTime() + rng.int(-200, 900) * DAY),
        status: a.status ?? 'OPERATIONAL',
        publicReportToken: token(),
      },
    });
    assets.push({ id, tag: a.tag, category: a.category, locationId });
  }

  // Preventive maintenance schedules (+ their generated occurrences become work orders below).
  const scheduledOccurrences: { scheduleId: string; title: string; category: string; assetId: string | null; locationId: string | null; priority: Priority; at: Date; checklist?: string }[] = [];
  for (const sc of bp.schedules) {
    const id = randomUUID();
    const asset = sc.asset ? assets.find((a) => a.tag === sc.asset) : undefined;
    const anchor = new Date(now.getTime() - 95 * DAY);
    anchor.setUTCHours(4, 30, 0, 0);
    const next = nextOccurrenceAfter(anchor, sc.unit, sc.interval, now, bp.timezone);
    await s.maintenanceSchedule.create({
      data: {
        id,
        organizationId: orgId,
        title: sc.title,
        categoryId: categoryIds.get(sc.category)!,
        priority: sc.priority,
        assetId: asset?.id,
        locationId: asset ? null : sc.location ? locationIds.get(sc.location) : null,
        checklistTemplateId: sc.checklist ? templateIds.get(sc.checklist) : null,
        frequencyUnit: sc.unit,
        frequencyInterval: sc.interval,
        startsAt: anchor,
        nextDueAt: next,
        leadTimeDays: 1,
        lastGeneratedAt: new Date(now.getTime() - rng.int(1, 20) * DAY),
      },
    });
    for (let n = 0; ; n++) {
      const at = occurrence(anchor, sc.unit, sc.interval, n, bp.timezone);
      if (at >= now) break;
      scheduledOccurrences.push({ scheduleId: id, title: sc.title, category: sc.category, assetId: asset?.id ?? null, locationId: asset?.locationId ?? null, priority: sc.priority, at, checklist: sc.checklist });
    }
  }

  // Work orders: corrective requests + scheduled occurrences, numbered chronologically.
  type Draft = { createdAt: Date; title: string; description: string; category: string; assetId: string | null; locationId: string | null; priority: Priority; requesterId: string | null; scheduleId: string | null; scheduledFor: Date | null; checklist?: string; source: 'WEB' | 'QR' | 'GUEST_QR' | 'SCHEDULED'; guest?: { name: string; contact: string } };
  const drafts: Draft[] = [];
  for (let i = 0; i < bp.workOrders; i++) {
    const issue = rng.pick(bp.issues);
    const candidates = issue.assetCategory ? assets.filter((a) => a.category === issue.assetCategory) : [];
    const asset = candidates.length && rng.chance(0.8) ? rng.pick(candidates) : null;
    const priority = rng.weighted([['CRITICAL', 6], ['HIGH', 22], ['MEDIUM', 50], ['LOW', 22]] as const);
    const guest = bp.policy?.qrReportingMode === 'PUBLIC' && rng.chance(0.06);
    drafts.push({
      createdAt: pastInstant(rng, now, 120),
      title: issue.title,
      description: issue.description,
      category: issue.category,
      assetId: asset?.id ?? null,
      locationId: asset?.locationId ?? rng.pick(leafRooms),
      priority,
      requesterId: guest ? null : rng.pick([...people.requesters, ...people.requesters, ...people.managers]),
      scheduleId: null,
      scheduledFor: null,
      checklist: categoryTemplate.get(issue.category),
      source: guest ? 'GUEST_QR' : asset && rng.chance(0.45) ? 'QR' : 'WEB',
      guest: guest ? { name: rng.pick(['Visiting parent', 'Guest lecturer', 'Delivery driver']), contact: `visitor${rng.int(10, 99)}@example.com` } : undefined,
    });
  }
  for (const o of scheduledOccurrences) {
    drafts.push({
      createdAt: new Date(o.at.getTime() - DAY),
      title: o.title,
      description: 'Preventive maintenance generated from the maintenance schedule.',
      category: o.category,
      assetId: o.assetId,
      locationId: o.locationId,
      priority: o.priority,
      requesterId: null,
      scheduleId: o.scheduleId,
      scheduledFor: o.at,
      checklist: o.checklist,
      source: 'SCHEDULED',
    });
  }
  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const evidenceBudget = canUpload ? 18 : 0;
  let evidenceUsed = 0;
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const audit: Prisma.AuditLogCreateManyInput[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    const number = i + 1;
    const id = randomUUID();
    const template = d.checklist ? templateItems.get(d.checklist) ?? [] : [];
    const ageDays = (now.getTime() - d.createdAt.getTime()) / DAY;
    const pace = ageDays < 2 ? rng.pick([1, 4, 12, 30]) : ageDays < 10 ? rng.pick([1, 1, 2, 4, 8]) : 1;
    const sim = simulate(rng, { createdAt: d.createdAt, priority: d.priority, categoryId: categoryIds.get(d.category)!, categoryName: d.category, requesterId: d.requesterId, scheduled: !!d.scheduleId, now, checklistCount: template.length, pace }, people);

    await s.workOrder.create({
      data: {
        id,
        organizationId: orgId,
        number,
        title: d.title,
        description: d.description,
        status: sim.status,
        priority: d.priority,
        source: d.source,
        categoryId: categoryIds.get(d.category)!,
        locationId: d.locationId,
        assetId: d.assetId,
        requesterId: d.requesterId,
        guestName: d.guest?.name,
        guestContact: d.guest?.contact,
        assigneeId: sim.assigneeId,
        scheduleId: d.scheduleId,
        scheduledFor: d.scheduledFor,
        slaCycle: sim.slaCycle,
        cycleStartedAt: sim.cycleStartedAt,
        responseDueAt: sim.responseDueAt,
        resolutionDueAt: sim.resolutionDueAt,
        slaWarningPercent: sim.warningPercent,
        respondedAt: sim.respondedAt,
        resolutionSubmittedAt: sim.resolutionSubmittedAt,
        resolvedAt: sim.resolvedAt,
        verifiedAt: sim.verifiedAt,
        closedAt: sim.closedAt,
        cancelledAt: sim.cancelledAt,
        reopenCount: sim.reopenCount,
        reworkCount: sim.reworkCount,
        escalationLevel: sim.escalationLevel,
        version: sim.history.length,
        createdAt: d.createdAt,
        updatedAt: sim.updatedAt,
      },
    });
    await s.workOrderStatusHistory.createMany({
      data: sim.history.map((h) => ({ organizationId: orgId, workOrderId: id, fromStatus: h.from, toStatus: h.to, actorId: h.actorId, reason: h.reason, createdAt: h.at })),
    });
    if (sim.assignments.length) {
      await s.workOrderAssignment.createMany({
        data: sim.assignments.map((a) => ({ organizationId: orgId, workOrderId: id, assigneeId: a.assigneeId, assignedById: a.assignedById, method: a.method, assignedAt: a.at, unassignedAt: a.unassignedAt })),
      });
    }
    if (template.length) {
      await s.workOrderChecklistItem.createMany({
        data: template.map((t, idx) => ({
          organizationId: orgId,
          workOrderId: id,
          label: t.label,
          required: t.required,
          sortOrder: idx,
          completedAt: sim.checklistDoneAt[idx] ?? null,
          completedById: sim.checklistDoneAt[idx] ? sim.checklistDoneBy : null,
        })),
      });
    }
    for (const sub of sim.submissions) {
      await s.resolutionSubmission.create({ data: { ...sub, organizationId: orgId, workOrderId: id } });
    }
    if (sim.slaEvents.length) {
      await s.slaEvent.createMany({ data: sim.slaEvents.map((e) => ({ ...e, organizationId: orgId, workOrderId: id })), skipDuplicates: true });
    }

    // Evidence photos for recent approved repairs (real files in private object storage).
    const approved = sim.submissions.find((x) => x.outcome === 'APPROVED');
    if (approved && evidenceUsed < evidenceBudget && now.getTime() - approved.submittedAt.getTime() < 40 * DAY) {
      const img = await evidenceImage(rng);
      const attId = randomUUID();
      const key = `org/${orgId}/work-orders/${id}/${attId}`;
      await s3!.send(new PutObjectCommand({ Bucket: bucket, Key: `${key}.jpg`, Body: img.full, ContentType: 'image/jpeg' }));
      await s3!.send(new PutObjectCommand({ Bucket: bucket, Key: `${key}.thumb.webp`, Body: img.thumb, ContentType: 'image/webp' }));
      await s.attachment.create({
        data: {
          id: attId,
          organizationId: orgId,
          workOrderId: id,
          submissionId: approved.id,
          uploadedById: approved.submittedById,
          kind: 'EVIDENCE',
          storageKey: `${key}.jpg`,
          thumbnailKey: `${key}.thumb.webp`,
          fileName: `demo-evidence-${formatWorkOrderNumber(number).toLowerCase()}.jpg`,
          contentType: 'image/jpeg',
          sizeBytes: img.full.length,
          width: 1280,
          height: 960,
          createdAt: approved.submittedAt,
        },
      });
      evidenceUsed++;
    }

    // Comments on a share of work orders.
    if (sim.history.length > 2 && rng.chance(0.35)) {
      const at = new Date(sim.history[1]!.at.getTime() + 25 * 60_000);
      if (at < now) {
        const author = sim.assigneeId && rng.chance(0.6) ? sim.assigneeId : (d.requesterId ?? people.managers[0]!);
        await s.workOrderComment.create({
          data: {
            organizationId: orgId,
            workOrderId: id,
            authorId: author,
            body: author === sim.assigneeId ? rng.pick(['On my way — will check within the hour.', 'Inspected; ordering a replacement part.', 'Please keep the room unlocked until 3pm.']) : rng.pick(['Thanks! This is affecting classes today.', 'Any update on this?', 'It got worse since this morning.']),
            isInternal: author === sim.assigneeId && rng.chance(0.3),
            createdAt: at,
          },
        });
      }
    }

    // Audit trail & recent notifications derived from the simulated history.
    for (const h of sim.history) {
      audit.push({
        organizationId: orgId,
        actorId: h.actorId,
        action: h.from === null ? 'workOrder.created' : `workOrder.${STATUS_META[h.to].label.toLowerCase().replace(/\s+/g, '_')}`,
        entityType: 'WorkOrder',
        entityId: id,
        metadata: { from: h.from, to: h.to, reason: h.reason, number },
        createdAt: h.at,
      });
    }
    const recent = now.getTime() - sim.updatedAt.getTime() < 6 * DAY;
    if (recent) {
      const label = `${formatWorkOrderNumber(number)} · ${d.title}`;
      for (const m of people.managers.slice(0, 2)) {
        notifications.push({ organizationId: orgId, userId: m, type: 'WORK_ORDER_CREATED', title: label, body: `New ${d.priority.toLowerCase()} priority request in ${d.category}.`, workOrderId: id, dedupeKey: `seed-created:${id}`, createdAt: d.createdAt, readAt: rng.chance(0.6) ? now : null });
      }
      if (sim.assigneeId) {
        notifications.push({ organizationId: orgId, userId: sim.assigneeId, type: 'WORK_ORDER_ASSIGNED', title: `${formatWorkOrderNumber(number)} assigned to you`, body: `${d.title} — ${d.priority.toLowerCase()} priority.`, workOrderId: id, dedupeKey: `seed-assigned:${id}`, createdAt: sim.assignments[0]?.at ?? d.createdAt, readAt: rng.chance(0.5) ? now : null });
      }
      if (d.requesterId && sim.status === 'PENDING_VERIFICATION') {
        notifications.push({ organizationId: orgId, userId: d.requesterId, type: 'RESOLUTION_SUBMITTED', title: `${formatWorkOrderNumber(number)} ready for verification`, body: `${d.title} — please confirm the repair.`, workOrderId: id, dedupeKey: `seed-submitted:${id}`, createdAt: sim.updatedAt, readAt: null });
      }
      for (const e of sim.slaEvents.filter((x) => x.type.endsWith('BREACH') && now.getTime() - x.occurredAt.getTime() < 6 * DAY)) {
        for (const m of people.managers.slice(0, 2)) {
          notifications.push({ organizationId: orgId, userId: m, type: 'SLA_BREACH', title: `${formatWorkOrderNumber(number)} missed its ${e.type.startsWith('RESPONSE') ? 'response' : 'resolution'} target`, body: d.title, workOrderId: id, dedupeKey: `seed-${e.type}:${id}`, createdAt: e.occurredAt, readAt: rng.chance(0.4) ? now : null });
        }
      }
    }
  }
  await s.organization.update({ where: { id: orgId }, data: { workOrderSeq: drafts.length } });
  if (notifications.length) await s.notification.createMany({ data: notifications, skipDuplicates: true });
  for (let i = 0; i < audit.length; i += 1000) await s.auditLog.createMany({ data: audit.slice(i, i + 1000) });

  // Asset status reflects open work (never overriding OUT_OF_SERVICE).
  const open = await s.workOrder.groupBy({
    by: ['assetId', 'status'],
    where: { organizationId: orgId, assetId: { not: null }, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_VERIFICATION'] } },
    _count: true,
  });
  for (const row of open) {
    await s.asset.updateMany({
      where: { id: row.assetId!, organizationId: orgId, status: { not: 'OUT_OF_SERVICE' } },
      data: { status: row.status === 'IN_PROGRESS' ? 'UNDER_MAINTENANCE' : 'NEEDS_ATTENTION' },
    });
  }

  // A pending invitation so the team page shows the invite flow.
  const inviter = people.managers[0]!;
  await s.invitation.create({
    data: { organizationId: orgId, email: `new.technician@${bp.slug.split('-')[0]}.demo`, role: 'TECHNICIAN', tokenHash: randomBytes(32).toString('hex'), invitedById: inviter, expiresAt: new Date(now.getTime() + 6 * DAY) },
  });

  console.log(`  ✓ ${bp.name}: ${bp.people.length} people, ${bp.assets.length} assets, ${drafts.length} work orders, ${evidenceUsed} evidence photos`);
}

function pickTargets(p: Priority) {
  const t = DEFAULT_SLA_TARGETS[p];
  return { responseMinutes: t.responseMinutes, resolutionMinutes: t.resolutionMinutes, warningPercent: t.warningPercent, description: t.description };
}

async function main(): Promise<void> {
  console.log('Seeding FixFlow demo data…');
  const passwordHash = await hash(DEMO_PASSWORD, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const canUpload = await ensureBucket();
  if (!canUpload) console.warn('  ! Object storage unavailable — evidence photos will be skipped.');
  for (const bp of BLUEPRINTS) await seedOrg(bp, passwordHash, canUpload);
  console.log(`Done. Demo password for every account: ${DEMO_PASSWORD} (local development only)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
