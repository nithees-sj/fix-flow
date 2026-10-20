import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isUniqueViolation, type Database, type Tx } from '@fixflow/db';
import {
  createCategorySchema,
  updateCategorySchema,
  type CategoryColor,
  type CategoryDto,
  type CategoryIcon,
  type CreateCategoryInput,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { conflict, notFound } from '../../common/errors.js';
import { UuidParamPipe, ZBody } from '../../common/zod.js';
import { AuditService } from '../../infra/audit.service.js';
import { DATABASE } from '../../infra/tokens.js';

@ApiTags('catalog')
@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private async load(tx: Tx, orgId: string, where: { id?: string; includeArchived?: boolean }): Promise<CategoryDto[]> {
    const rows = await tx.category.findMany({
      where: { organizationId: orgId, ...(where.id ? { id: where.id } : {}), ...(where.includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
      include: { _count: { select: { workOrders: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color as CategoryColor,
      icon: c.icon as CategoryIcon,
      defaultChecklistTemplateId: c.defaultChecklistTemplateId,
      archived: !!c.archivedAt,
      workOrderCount: c._count.workOrders,
    }));
  }

  @Get()
  list(@CurrentActor() actor: Actor, @Query('includeArchived') includeArchived?: string): Promise<CategoryDto[]> {
    return this.db.tx(actor.ctx, (tx) => this.load(tx, actor.organizationId, { includeArchived: includeArchived === 'true' }));
  }

  @Post()
  @RequirePermissions('category.manage')
  async create(@CurrentActor() actor: Actor, @ZBody(createCategorySchema) body: CreateCategoryInput): Promise<CategoryDto> {
    try {
      return await this.db.tx(actor.ctx, async (tx) => {
        await this.assertTemplate(tx, actor.organizationId, body.defaultChecklistTemplateId);
        const c = await tx.category.create({ data: { organizationId: actor.organizationId, ...body }, select: { id: true } });
        await this.audit.record(tx, actor, { action: 'category.created', entityType: 'Category', entityId: c.id, metadata: { name: body.name } });
        return (await this.load(tx, actor.organizationId, { id: c.id, includeArchived: true }))[0]!;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('A category with this name already exists');
      throw e;
    }
  }

  @Patch(':id')
  @RequirePermissions('category.manage')
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @ZBody(updateCategorySchema) body: Partial<CreateCategoryInput>,
  ): Promise<CategoryDto> {
    try {
      return await this.db.tx(actor.ctx, async (tx) => {
        const existing = await tx.category.findFirst({ where: { id, organizationId: actor.organizationId } });
        if (!existing) throw notFound('Category');
        await this.assertTemplate(tx, actor.organizationId, body.defaultChecklistTemplateId);
        await tx.category.update({ where: { id }, data: body });
        await this.audit.record(tx, actor, { action: 'category.updated', entityType: 'Category', entityId: id, metadata: { changes: body } });
        return (await this.load(tx, actor.organizationId, { id, includeArchived: true }))[0]!;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('A category with this name already exists');
      throw e;
    }
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('category.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<CategoryDto> {
    return this.setArchived(actor, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions('category.manage')
  restore(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<CategoryDto> {
    return this.setArchived(actor, id, false);
  }

  private setArchived(actor: Actor, id: string, archived: boolean): Promise<CategoryDto> {
    return this.db.tx(actor.ctx, async (tx) => {
      const res = await tx.category.updateMany({ where: { id, organizationId: actor.organizationId }, data: { archivedAt: archived ? new Date() : null } });
      if (!res.count) throw notFound('Category');
      await this.audit.record(tx, actor, { action: archived ? 'category.archived' : 'category.restored', entityType: 'Category', entityId: id });
      return (await this.load(tx, actor.organizationId, { id, includeArchived: true }))[0]!;
    });
  }

  private async assertTemplate(tx: Tx, orgId: string, templateId: string | null | undefined): Promise<void> {
    if (!templateId) return;
    const ok = await tx.checklistTemplate.count({ where: { id: templateId, organizationId: orgId, archivedAt: null } });
    if (!ok) throw notFound('Checklist template');
  }
}
