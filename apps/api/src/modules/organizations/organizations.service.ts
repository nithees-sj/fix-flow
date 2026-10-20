import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Database, Organization, Tx } from '@fixflow/db';
import {
  DEFAULT_SLA_TARGETS,
  PRIORITIES,
  type CreateOrganizationInput,
  type OrganizationDto,
  type OrganizationPolicy,
  type UpdateOrganizationInput,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { AuditService } from '../../infra/audit.service.js';
import { keys } from '../../infra/redis.js';
import { DATABASE, REDIS } from '../../infra/tokens.js';
import { DEFAULT_CATEGORIES, DEFAULT_CHECKLISTS, slugify } from './defaults.js';

export function toOrganizationDto(o: Organization): OrganizationDto {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    industry: o.industry,
    timezone: o.timezone,
    onboardingCompletedAt: o.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    policy: {
      requesterCanVerify: o.requesterCanVerify,
      technicianSelfAssign: o.technicianSelfAssign,
      requesterSeesAllOrgRequests: o.requesterSeesAllOrgRequests,
      requireEvidencePhoto: o.requireEvidencePhoto,
      reopenWindowDays: o.reopenWindowDays,
      autoCloseDays: o.autoCloseDays,
      autoAssignMode: o.autoAssignMode,
      qrReportingMode: o.qrReportingMode,
    },
  };
}

export const reportToken = () => randomBytes(18).toString('base64url');

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates the organization, the creator's ORG_ADMIN membership and a sensible starter
   * catalog in ONE transaction. The id is generated up-front so the insert runs under the
   * new tenant's RLS context (WITH CHECK id = app.org_id) — no BYPASSRLS needed.
   */
  async create(userId: string, input: CreateOrganizationInput, client: { ip: string | null; userAgent: string | null }): Promise<OrganizationDto> {
    const id = randomUUID();
    const slug = `${slugify(input.name)}-${randomBytes(3).toString('hex')}`;
    const org = await this.db.tx({ organizationId: id, userId }, async (tx) => {
      const created = await tx.organization.create({
        data: { id, name: input.name, slug, industry: input.industry, timezone: input.timezone },
      });
      await tx.membership.create({ data: { organizationId: id, userId, role: 'ORG_ADMIN' }, select: { id: true } });
      await this.seedDefaults(tx, id);
      await this.audit.record(tx, { organizationId: id, userId, ...client }, {
        action: 'organization.created',
        entityType: 'Organization',
        entityId: id,
        metadata: { name: input.name, industry: input.industry },
      });
      return created;
    });
    return toOrganizationDto(org);
  }

  private async seedDefaults(tx: Tx, organizationId: string): Promise<void> {
    await tx.slaPolicy.createMany({
      data: PRIORITIES.map((priority) => ({
        organizationId,
        priority,
        responseMinutes: DEFAULT_SLA_TARGETS[priority].responseMinutes,
        resolutionMinutes: DEFAULT_SLA_TARGETS[priority].resolutionMinutes,
        warningPercent: DEFAULT_SLA_TARGETS[priority].warningPercent,
        description: DEFAULT_SLA_TARGETS[priority].description,
      })),
    });
    const templateIds = new Map<string, string>();
    for (const [name, t] of Object.entries(DEFAULT_CHECKLISTS)) {
      const templateId = randomUUID();
      await tx.checklistTemplate.create({ data: { id: templateId, organizationId, name, description: t.description }, select: { id: true } });
      await tx.checklistTemplateItem.createMany({
        data: t.items.map((item, i) => ({ organizationId, templateId, label: item.label, required: item.required, sortOrder: i })),
      });
      templateIds.set(name, templateId);
    }
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        organizationId,
        name: c.name,
        description: c.description,
        color: c.color,
        icon: c.icon,
        defaultChecklistTemplateId: c.checklist ? (templateIds.get(c.checklist) ?? null) : null,
      })),
    });
  }

  async current(actor: Actor): Promise<OrganizationDto> {
    const org = await this.db.tx(actor.ctx, (tx) => tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }));
    return toOrganizationDto(org);
  }

  async update(actor: Actor, input: UpdateOrganizationInput): Promise<OrganizationDto> {
    const org = await this.db.tx(actor.ctx, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
      const after = await tx.organization.update({ where: { id: actor.organizationId }, data: input });
      await this.audit.record(tx, actor, {
        action: 'organization.updated',
        entityType: 'Organization',
        entityId: actor.organizationId,
        metadata: diff(before, after, Object.keys(input)),
      });
      return after;
    });
    return toOrganizationDto(org);
  }

  async updatePolicy(actor: Actor, input: Partial<OrganizationPolicy>): Promise<OrganizationDto> {
    const org = await this.db.tx(actor.ctx, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
      const after = await tx.organization.update({ where: { id: actor.organizationId }, data: input });
      await this.audit.record(tx, actor, {
        action: 'organization.policyUpdated',
        entityType: 'Organization',
        entityId: actor.organizationId,
        metadata: diff(before, after, Object.keys(input)),
      });
      return after;
    });
    return toOrganizationDto(org);
  }

  async completeOnboarding(actor: Actor): Promise<OrganizationDto> {
    const org = await this.db.tx(actor.ctx, async (tx) => {
      const o = await tx.organization.update({
        where: { id: actor.organizationId },
        data: { onboardingCompletedAt: new Date() },
      });
      await this.audit.record(tx, actor, { action: 'organization.onboardingCompleted', entityType: 'Organization', entityId: o.id });
      return o;
    });
    return toOrganizationDto(org);
  }

  async invalidateMembership(organizationId: string, userId: string): Promise<void> {
    await this.redis.del(keys.membership(organizationId, userId));
  }
}

export function diff<T extends object>(before: T, after: T, fields: string[]): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = (before as Record<string, unknown>)[f];
    const b = (after as Record<string, unknown>)[f];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) out[f] = { from: norm(a), to: norm(b) };
  }
  return out;
}

export { reportToken as newReportToken };
