import { z } from 'zod';
import { PRIORITIES, WORK_ORDER_STATUSES } from '../enums.js';
import {
  expectedVersionSchema,
  idSchema,
  isoDateTime,
  optionalLongText,
  paginationSchema,
  queryBoolean,
  queryList,
  sortOrderSchema,
} from './common.js';

export const createWorkOrderSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the issue a short title').max(140),
    description: z.string().trim().max(4000).default(''),
    priority: z.enum(PRIORITIES).default('MEDIUM'),
    categoryId: idSchema,
    locationId: idSchema.nullable().optional(),
    assetId: idSchema.nullable().optional(),
    checklistTemplateId: idSchema.nullable().optional(),
    /** Set when the request originated from scanning a QR label. */
    qrToken: z.string().min(16).max(64).optional(),
  })
  .refine((v) => v.locationId || v.assetId, {
    path: ['locationId'],
    message: 'Choose where the issue is',
  });
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const updateWorkOrderSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    title: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(4000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    categoryId: idSchema.optional(),
    locationId: idSchema.nullable().optional(),
    assetId: idSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 1, 'Nothing to update');
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;

export const WORK_ORDER_SORTS = [
  'number',
  'createdAt',
  'updatedAt',
  'priority',
  'status',
  'resolutionDueAt',
] as const;

export const workOrderListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: queryList(WORK_ORDER_STATUSES).optional(),
  priority: queryList(PRIORITIES).optional(),
  categoryId: idSchema.optional(),
  /** uuid, "me" or "unassigned" */
  assigneeId: z.union([idSchema, z.enum(['me', 'unassigned'])]).optional(),
  requesterId: z.union([idSchema, z.literal('me')]).optional(),
  locationId: idSchema.optional(),
  assetId: idSchema.optional(),
  overdue: queryBoolean.optional(),
  createdFrom: isoDateTime.optional(),
  createdTo: isoDateTime.optional(),
  sort: z.enum(WORK_ORDER_SORTS).default('createdAt'),
  order: sortOrderSchema,
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;

const reason = z.string().trim().min(3, 'Add a short reason').max(500);

/**
 * Every status change goes through one endpoint: POST /work-orders/:id/transitions.
 * The discriminated union makes the required fields of each action explicit.
 */
export const transitionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), expectedVersion: expectedVersionSchema, assigneeId: idSchema }),
  z.object({ action: z.literal('reassign'), expectedVersion: expectedVersionSchema, assigneeId: idSchema }),
  z.object({ action: z.literal('unassign'), expectedVersion: expectedVersionSchema, reason }),
  z.object({ action: z.literal('start'), expectedVersion: expectedVersionSchema }),
  z.object({ action: z.literal('hold'), expectedVersion: expectedVersionSchema, reason }),
  z.object({ action: z.literal('resume'), expectedVersion: expectedVersionSchema }),
  z.object({
    action: z.literal('submit_resolution'),
    expectedVersion: expectedVersionSchema,
    notes: z.string().trim().min(10, 'Describe the work performed').max(4000),
    laborMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
    partsUsed: optionalLongText,
    attachmentIds: z.array(idSchema).max(10).default([]),
  }),
  z.object({
    action: z.literal('approve'),
    expectedVersion: expectedVersionSchema,
    note: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal('reject'), expectedVersion: expectedVersionSchema, reason }),
  z.object({ action: z.literal('close'), expectedVersion: expectedVersionSchema }),
  z.object({ action: z.literal('reopen'), expectedVersion: expectedVersionSchema, reason }),
  z.object({ action: z.literal('cancel'), expectedVersion: expectedVersionSchema, reason }),
]);
export type TransitionInput = z.infer<typeof transitionSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(4000),
  isInternal: z.boolean().default(false),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const setChecklistItemSchema = z.object({ completed: z.boolean() });

export const addChecklistItemSchema = z.object({
  label: z.string().trim().min(2).max(200),
  required: z.boolean().default(false),
});

export const attachmentUploadQuerySchema = z.object({
  kind: z.enum(['REPORT', 'PROGRESS', 'EVIDENCE']).default('PROGRESS'),
});

// ── Public QR reporting ───────────────────────────────────────────────────────

export const publicReportSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).default(''),
  categoryId: idSchema.optional(),
  guestName: z.string().trim().min(2).max(80),
  guestContact: z
    .string()
    .trim()
    .min(5)
    .max(120)
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^[+0-9 ()-]{6,}$/.test(v),
      'Enter an email address or phone number',
    ),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(0).optional(),
});
export type PublicReportInput = z.infer<typeof publicReportSchema>;

// ── Analytics / audit / notifications queries ─────────────────────────────────

export const analyticsQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
  })
  .refine((v) => new Date(v.from).getTime() < new Date(v.to).getTime(), {
    path: ['to'],
    message: '"to" must be after "from"',
  })
  .refine((v) => new Date(v.to).getTime() - new Date(v.from).getTime() <= 400 * 86_400_000, {
    path: ['from'],
    message: 'Range is limited to 400 days',
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const notificationListQuerySchema = cursorQuerySchema.extend({
  unreadOnly: queryBoolean.optional(),
});

export const auditListQuerySchema = cursorQuerySchema.extend({
  entityType: z.string().trim().max(40).optional(),
  actorId: idSchema.optional(),
  action: z.string().trim().max(60).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });
