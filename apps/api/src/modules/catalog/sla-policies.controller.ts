import { Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Database } from '@fixflow/db';
import { PRIORITIES, updateSlaPoliciesSchema, type SlaPolicyDto, type UpdateSlaPoliciesInput } from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { ZBody } from '../../common/zod.js';

@ApiTags('sla')
@Controller('sla-policies')
export class SlaPoliciesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'SLA targets per priority (readable by every member; shown in the request form)' })
  async list(@CurrentActor() actor: Actor): Promise<SlaPolicyDto[]> {
    const rows = await this.db.tx(actor.ctx, (tx) => tx.slaPolicy.findMany({ where: { organizationId: actor.organizationId } }));
    return PRIORITIES.map((p) => rows.find((r) => r.priority === p))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        priority: r.priority,
        responseMinutes: r.responseMinutes,
        resolutionMinutes: r.resolutionMinutes,
        warningPercent: r.warningPercent,
        escalationEnabled: r.escalationEnabled,
        description: r.description,
      }));
  }

  /**
   * Changes apply to work orders created (or re-prioritized / reopened) afterwards; existing
   * deadlines are snapshotted on each work order so history and analytics stay accurate.
   */
  @Put()
  @RequirePermissions('sla.manage')
  async update(@CurrentActor() actor: Actor, @ZBody(updateSlaPoliciesSchema) body: UpdateSlaPoliciesInput): Promise<SlaPolicyDto[]> {
    await this.db.tx(actor.ctx, async (tx) => {
      const before = await tx.slaPolicy.findMany({ where: { organizationId: actor.organizationId } });
      for (const p of body.policies) {
        await tx.slaPolicy.upsert({
          where: { organizationId_priority: { organizationId: actor.organizationId, priority: p.priority } },
          create: { organizationId: actor.organizationId, ...p },
          update: p,
        });
      }
      await this.audit.record(tx, actor, {
        action: 'sla.policiesUpdated',
        entityType: 'SlaPolicy',
        metadata: {
          before: before.map((b) => ({ priority: b.priority, responseMinutes: b.responseMinutes, resolutionMinutes: b.resolutionMinutes })),
          after: body.policies.map((b) => ({ priority: b.priority, responseMinutes: b.responseMinutes, resolutionMinutes: b.resolutionMinutes })),
        },
      });
    });
    return this.list(actor);
  }
}
