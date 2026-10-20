import { Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Database, Tx } from '@fixflow/db';
import {
  createChecklistTemplateSchema,
  updateChecklistTemplateSchema,
  type ChecklistTemplateDto,
  type CreateChecklistTemplateInput,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody } from '../../common/zod.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';

@ApiTags('catalog')
@Controller('checklist-templates')
export class ChecklistTemplatesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private async load(tx: Tx, orgId: string, id?: string): Promise<ChecklistTemplateDto[]> {
    const rows = await tx.checklistTemplate.findMany({
      where: { organizationId: orgId, archivedAt: null, ...(id ? { id } : {}) },
      orderBy: { name: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' } }, _count: { select: { categories: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      items: t.items.map((i) => ({ id: i.id, label: i.label, required: i.required, sortOrder: i.sortOrder })),
      usedByCategories: t._count.categories,
    }));
  }

  @Get()
  @RequirePermissions('workOrder.readAll')
  list(@CurrentActor() actor: Actor): Promise<ChecklistTemplateDto[]> {
    return this.db.tx(actor.ctx, (tx) => this.load(tx, actor.organizationId));
  }

  @Post()
  @RequirePermissions('checklist.manage')
  create(@CurrentActor() actor: Actor, @ZBody(createChecklistTemplateSchema) body: CreateChecklistTemplateInput): Promise<ChecklistTemplateDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const t = await tx.checklistTemplate.create({
        data: { organizationId: actor.organizationId, name: body.name, description: body.description },
        select: { id: true },
      });
      await tx.checklistTemplateItem.createMany({
        data: body.items.map((it, i) => ({ organizationId: actor.organizationId, templateId: t.id, label: it.label, required: it.required, sortOrder: i })),
      });
      await this.audit.record(tx, actor, { action: 'checklist.created', entityType: 'ChecklistTemplate', entityId: t.id, metadata: { name: body.name } });
      return (await this.load(tx, actor.organizationId, t.id))[0]!;
    });
  }

  /** Replaces the item list; existing work orders keep their own copied checklist. */
  @Patch(':id')
  @RequirePermissions('checklist.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @ZBody(updateChecklistTemplateSchema) body: Partial<CreateChecklistTemplateInput>,
  ): Promise<ChecklistTemplateDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const t = await tx.checklistTemplate.findFirst({ where: { id, organizationId: actor.organizationId, archivedAt: null } });
      if (!t) throw notFound('Checklist template');
      await tx.checklistTemplate.update({ where: { id }, data: { name: body.name, description: body.description } });
      if (body.items) {
        await tx.checklistTemplateItem.deleteMany({ where: { organizationId: actor.organizationId, templateId: id } });
        await tx.checklistTemplateItem.createMany({
          data: body.items.map((it, i) => ({ organizationId: actor.organizationId, templateId: id, label: it.label, required: it.required, sortOrder: i })),
        });
      }
      await this.audit.record(tx, actor, { action: 'checklist.updated', entityType: 'ChecklistTemplate', entityId: id });
      return (await this.load(tx, actor.organizationId, id))[0]!;
    });
  }

  @Post(':id/archive')
  @HttpCode(204)
  @RequirePermissions('checklist.manage')
  async archive(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.db.tx(actor.ctx, async (tx) => {
      const res = await tx.checklistTemplate.updateMany({ where: { id, organizationId: actor.organizationId }, data: { archivedAt: new Date() } });
      if (!res.count) throw notFound('Checklist template');
      await tx.category.updateMany({ where: { organizationId: actor.organizationId, defaultChecklistTemplateId: id }, data: { defaultChecklistTemplateId: null } });
      await this.audit.record(tx, actor, { action: 'checklist.archived', entityType: 'ChecklistTemplate', entityId: id });
    });
  }
}
