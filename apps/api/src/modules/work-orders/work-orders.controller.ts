import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  addChecklistItemSchema,
  attachmentUploadQuerySchema,
  createCommentSchema,
  createWorkOrderSchema,
  setChecklistItemSchema,
  transitionSchema,
  updateWorkOrderSchema,
  workOrderListQuerySchema,
  type AttachmentDto,
  type ChecklistItemDto,
  type CreateCommentInput,
  type CreateWorkOrderInput,
  type Paginated,
  type TechnicianRecommendation,
  type TimelineEntry,
  type TransitionInput,
  type UpdateWorkOrderInput,
  type WorkOrderDetail,
  type WorkOrderListQuery,
  type WorkOrderSummary,
} from '@fixflow/shared';
import type { z } from 'zod';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency.js';
import { UuidParamPipe, ZBody, ZQuery, ZodValidationPipe } from '../../common/zod.js';
import { ActivityService } from './activity.service.js';
import { AssignmentService } from './assignment.service.js';
import { AttachmentsService, MAX_UPLOAD_BYTES } from './attachments.service.js';
import { TransitionsService } from './transitions.service.js';
import { WorkOrderQueryService } from './work-order-query.service.js';
import { WorkOrdersService } from './work-orders.service.js';

@ApiTags('work-orders')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly query: WorkOrderQueryService,
    private readonly workOrders: WorkOrdersService,
    private readonly transitions: TransitionsService,
    private readonly activity: ActivityService,
    private readonly attachments: AttachmentsService,
    private readonly assignment: AssignmentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List work orders visible to the caller (filters, sorting, pagination)' })
  list(@CurrentActor() actor: Actor, @ZQuery(workOrderListQuerySchema) q: WorkOrderListQuery): Promise<Paginated<WorkOrderSummary>> {
    return this.query.list(actor, q);
  }

  @Post()
  @RequirePermissions('workOrder.create')
  @Idempotent()
  @ApiOperation({ summary: 'Report an issue / create a work order' })
  create(@CurrentActor() actor: Actor, @ZBody(createWorkOrderSchema) body: CreateWorkOrderInput): Promise<WorkOrderDetail> {
    return this.workOrders.create(actor, body);
  }

  @Get('number/:number')
  @ApiOperation({ summary: 'Resolve a human-friendly number (WO-0042 → 42) to the work order' })
  byNumber(@CurrentActor() actor: Actor, @Param('number', ParseIntPipe) number: number): Promise<WorkOrderDetail> {
    return this.query.getByNumber(actor, number);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<WorkOrderDetail> {
    return this.query.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit details (managers; requesters may edit their own OPEN requests)' })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @ZBody(updateWorkOrderSchema) body: UpdateWorkOrderInput,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.update(actor, id, body);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @Idempotent()
  @ApiOperation({ summary: 'Perform a lifecycle action (assign, start, hold, submit_resolution, approve, reject, close, reopen, cancel…)' })
  transition(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @ZBody(transitionSchema) body: TransitionInput,
  ): Promise<WorkOrderDetail> {
    return this.transitions.transition(actor, id, body);
  }

  @Get(':id/assignment-suggestions')
  suggestions(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<TechnicianRecommendation[]> {
    return this.assignment.suggestions(actor, id);
  }

  @Get(':id/timeline')
  timeline(@CurrentActor() actor: Actor, @Param('id', UuidParamPipe) id: string): Promise<TimelineEntry[]> {
    return this.activity.timeline(actor, id);
  }

  @Post(':id/comments')
  @Idempotent()
  comment(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @ZBody(createCommentSchema) body: CreateCommentInput,
  ): Promise<TimelineEntry> {
    return this.activity.addComment(actor, id, body);
  }

  @Put(':id/checklist/:itemId')
  @Idempotent()
  setChecklistItem(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @Param('itemId', UuidParamPipe) itemId: string,
    @ZBody(setChecklistItemSchema) body: { completed: boolean },
  ): Promise<ChecklistItemDto> {
    return this.activity.setChecklistItem(actor, id, itemId, body.completed);
  }

  @Post(':id/checklist')
  addChecklistItem(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @ZBody(addChecklistItemSchema) body: { label: string; required: boolean },
  ): Promise<ChecklistItemDto> {
    return this.activity.addChecklistItem(actor, id, body);
  }

  @Post(':id/attachments')
  @Idempotent()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload a photo or PDF (10 MB max; validated by content, images re-encoded)' })
  upload(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; size: number } | undefined,
    @Query(new ZodValidationPipe(attachmentUploadQuerySchema)) q: z.output<typeof attachmentUploadQuerySchema>,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(actor, id, file, q.kind);
  }
}

@ApiTags('work-orders')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':id/content')
  @ApiOperation({ summary: 'Stream an attachment (authorization checked against its work order)' })
  async content(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParamPipe) id: string,
    @Query('variant') variant: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.open(actor, id, variant === 'thumb' ? 'thumb' : 'original');
    res.setHeader('Content-Type', file.contentType);
    if (file.contentLength) res.setHeader('Content-Length', String(file.contentLength));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    const disposition = file.contentType === 'application/pdf' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${file.fileName.replace(/"/g, '')}"`);
    file.stream.pipe(res);
  }
}
