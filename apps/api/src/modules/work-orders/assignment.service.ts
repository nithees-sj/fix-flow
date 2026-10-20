import { Inject, Injectable } from '@nestjs/common';
import type { Database, Tx } from '@fixflow/db';
import { rankTechnicians, TECHNICIAN_WORKLOAD_STATUSES, type TechnicianRecommendation } from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { forbidden } from '../../common/errors.js';
import { DATABASE } from '../../infra/tokens.js';
import { loadPolicy } from './policy.js';
import { WorkOrderQueryService } from './work-order-query.service.js';

@Injectable()
export class AssignmentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly query: WorkOrderQueryService,
  ) {}

  /** Ranked, explainable technician suggestions for a work order (skills × workload). */
  async suggestions(actor: Actor, workOrderId: string): Promise<TechnicianRecommendation[]> {
    if (!actor.permissions.has('workOrder.assign')) throw forbidden();
    return this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const wo = await this.query.findVisible(tx, actor, policy, workOrderId);
      return this.rank(tx, actor.organizationId, wo.categoryId, wo.category.name);
    });
  }

  async rank(tx: Tx, organizationId: string, categoryId: string, categoryName: string): Promise<TechnicianRecommendation[]> {
    const techs = await tx.membership.findMany({
      where: { organizationId, role: 'TECHNICIAN' },
      include: { user: { select: { name: true } }, skills: { select: { categoryId: true, level: true } } },
    });
    const load = await tx.workOrder.groupBy({
      by: ['assigneeId'],
      where: { organizationId, assigneeId: { in: techs.map((t) => t.userId) }, status: { in: [...TECHNICIAN_WORKLOAD_STATUSES] } },
      _count: true,
    });
    const openJobs = new Map(load.map((l) => [l.assigneeId, l._count]));
    return rankTechnicians(
      techs.map((t) => ({
        userId: t.userId,
        name: t.user.name,
        isAvailable: t.isAvailable,
        isActive: t.status === 'ACTIVE',
        openJobs: openJobs.get(t.userId) ?? 0,
        skills: t.skills,
      })),
      categoryId,
      categoryName,
    );
  }
}
