import { Injectable, Inject } from '@nestjs/common';
import type { Database, Prisma } from '@fixflow/db';
import {
  TECHNICIAN_WORKLOAD_STATUSES,
  type MemberDto,
  type MemberListQuery,
  type MemberProfileDto,
  type Paginated,
  type SetSkillsInput,
  type UpdateMemberInput,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { AuditService } from '../../infra/audit.service.js';
import { RealtimePublisher } from '../../infra/realtime.publisher.js';
import { DATABASE } from '../../infra/tokens.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { WorkOrderQueryService } from '../work-orders/work-order-query.service.js';

const memberInclude = {
  user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
  skills: { include: { category: { select: { name: true } } }, orderBy: { level: 'desc' } },
} satisfies Prisma.MembershipInclude;

type MemberRow = Prisma.MembershipGetPayload<{ include: typeof memberInclude }>;

@Injectable()
export class MembersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationsService,
    private readonly realtime: RealtimePublisher,
    private readonly workOrders: WorkOrderQueryService,
  ) {}

  private toDto(m: MemberRow, openJobs: number): MemberDto {
    return {
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      status: m.status,
      jobTitle: m.jobTitle,
      isAvailable: m.isAvailable,
      openJobs,
      joinedAt: m.createdAt.toISOString(),
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      skills: m.skills.map((s) => ({ categoryId: s.categoryId, categoryName: s.category.name, level: s.level })),
    };
  }

  private async openJobsByUser(tx: Prisma.TransactionClient, organizationId: string, userIds: string[]): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();
    const rows = await tx.workOrder.groupBy({
      by: ['assigneeId'],
      where: { organizationId, assigneeId: { in: userIds }, status: { in: [...TECHNICIAN_WORKLOAD_STATUSES] } },
      _count: true,
    });
    return new Map(rows.map((r) => [r.assigneeId!, r._count]));
  }

  async list(actor: Actor, q: MemberListQuery): Promise<Paginated<MemberDto>> {
    return this.db.tx(actor.ctx, async (tx) => {
      const where: Prisma.MembershipWhereInput = {
        organizationId: actor.organizationId,
        ...(q.role ? { role: q.role } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.q
          ? { OR: [{ user: { name: { contains: q.q, mode: 'insensitive' } } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }, { jobTitle: { contains: q.q, mode: 'insensitive' } }] }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.membership.findMany({
          where,
          include: memberInclude,
          orderBy: [{ status: 'asc' }, { role: 'asc' }, { user: { name: 'asc' } }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.membership.count({ where }),
      ]);
      const open = await this.openJobsByUser(tx, actor.organizationId, rows.map((r) => r.userId));
      return {
        data: rows.map((r) => this.toDto(r, open.get(r.userId) ?? 0)),
        meta: { page: q.page, pageSize: q.pageSize, total, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) },
      };
    });
  }

  async get(actor: Actor, membershipId: string): Promise<MemberProfileDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id: membershipId, organizationId: actor.organizationId }, include: memberInclude });
      if (!m) throw notFound('Team member');
      const open = await this.openJobsByUser(tx, actor.organizationId, [m.userId]);
      const since = new Date(Date.now() - 30 * 86_400_000);
      const completed = await tx.workOrder.findMany({
        where: { organizationId: actor.organizationId, assigneeId: m.userId, resolvedAt: { gte: since } },
        select: { createdAt: true, cycleStartedAt: true, resolutionSubmittedAt: true, resolutionDueAt: true, reworkCount: true },
      });
      const durations = completed
        .filter((w) => w.resolutionSubmittedAt)
        .map((w) => (w.resolutionSubmittedAt!.getTime() - w.cycleStartedAt.getTime()) / 60_000);
      const met = completed.filter((w) => w.resolutionSubmittedAt && w.resolutionSubmittedAt <= w.resolutionDueAt).length;
      const recent = await this.workOrders.listSummaries(tx, actor.organizationId, {
        where: { assigneeId: m.userId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      });
      return {
        ...this.toDto(m, open.get(m.userId) ?? 0),
        stats: {
          completedLast30d: completed.length,
          avgResolutionMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
          slaMetRate: completed.length ? met / completed.length : null,
          reworkRate: completed.length ? completed.filter((w) => w.reworkCount > 0).length / completed.length : null,
        },
        recentWorkOrders: recent,
      };
    });
  }

  async update(actor: Actor, membershipId: string, input: UpdateMemberInput): Promise<MemberDto> {
    const managingPeople = input.role !== undefined || input.status !== undefined;
    if (managingPeople && !actor.permissions.has('team.manage')) throw forbidden();
    if (!managingPeople && !actor.permissions.has('team.manageSkills')) throw forbidden();

    const result = await this.db.tx(actor.ctx, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id: membershipId, organizationId: actor.organizationId } });
      if (!m) throw notFound('Team member');
      if (m.userId === actor.userId && managingPeople) throw badRequest('You cannot change your own role or status.');
      // Never leave an organization without an active admin.
      const demotingAdmin = m.role === 'ORG_ADMIN' && ((input.role && input.role !== 'ORG_ADMIN') || input.status === 'SUSPENDED');
      if (demotingAdmin) {
        const admins = await tx.membership.count({ where: { organizationId: actor.organizationId, role: 'ORG_ADMIN', status: 'ACTIVE' } });
        if (admins <= 1) throw conflict('An organization needs at least one active admin.');
      }
      // Technicians with open jobs must be reassigned before losing the technician role.
      if (m.role === 'TECHNICIAN' && ((input.role && input.role !== 'TECHNICIAN') || input.status === 'SUSPENDED')) {
        const open = await tx.workOrder.count({ where: { organizationId: actor.organizationId, assigneeId: m.userId, status: { in: [...TECHNICIAN_WORKLOAD_STATUSES] } } });
        if (open > 0) throw conflict(`Reassign this technician's ${open} open job${open === 1 ? '' : 's'} first.`);
      }
      const updated = await tx.membership.update({ where: { id: m.id }, data: input, include: memberInclude });
      await this.audit.record(tx, actor, {
        action: 'member.updated',
        entityType: 'Membership',
        entityId: m.id,
        metadata: { userId: m.userId, changes: input, previous: { role: m.role, status: m.status } },
      });
      const open = await this.openJobsByUser(tx, actor.organizationId, [m.userId]);
      return this.toDto(updated, open.get(m.userId) ?? 0);
    });
    await this.orgs.invalidateMembership(actor.organizationId, result.userId);
    if (input.status === 'SUSPENDED' || input.role) this.realtime.sessionExpired(result.userId);
    return result;
  }

  async setSkills(actor: Actor, membershipId: string, input: SetSkillsInput): Promise<MemberDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id: membershipId, organizationId: actor.organizationId } });
      if (!m) throw notFound('Team member');
      const categoryIds = input.skills.map((s) => s.categoryId);
      const owned = await tx.category.count({ where: { organizationId: actor.organizationId, id: { in: categoryIds } } });
      if (owned !== new Set(categoryIds).size) throw notFound('Category');
      await tx.technicianSkill.deleteMany({ where: { organizationId: actor.organizationId, membershipId: m.id } });
      if (input.skills.length) {
        await tx.technicianSkill.createMany({
          data: input.skills.map((s) => ({ organizationId: actor.organizationId, membershipId: m.id, categoryId: s.categoryId, level: s.level })),
        });
      }
      await this.audit.record(tx, actor, { action: 'member.skillsUpdated', entityType: 'Membership', entityId: m.id, metadata: { skills: input.skills } });
      const updated = await tx.membership.findUniqueOrThrow({ where: { id: m.id }, include: memberInclude });
      const open = await this.openJobsByUser(tx, actor.organizationId, [m.userId]);
      return this.toDto(updated, open.get(m.userId) ?? 0);
    });
  }

  /** Technicians toggle their own availability (excluded from auto-assignment when off). */
  async setOwnAvailability(actor: Actor, isAvailable: boolean): Promise<{ isAvailable: boolean }> {
    await this.db.tx(actor.ctx, async (tx) => {
      await tx.membership.update({ where: { id: actor.membershipId }, data: { isAvailable } });
      await this.audit.record(tx, actor, { action: 'member.availabilityChanged', entityType: 'Membership', entityId: actor.membershipId, metadata: { isAvailable } });
    });
    return { isAvailable };
  }
}
