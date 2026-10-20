import { z } from 'zod';
import { ASSET_STATUSES, FREQUENCY_UNITS, LOCATION_TYPES, PRIORITIES } from '../enums.js';
import {
  idSchema,
  isoDateTime,
  optionalLongText,
  optionalShortText,
  paginationSchema,
  queryList,
  sortOrderSchema,
} from './common.js';

// ── Locations ─────────────────────────────────────────────────────────────────

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  type: z.enum(LOCATION_TYPES),
  parentId: idSchema.nullable().default(null),
  code: z
    .string()
    .trim()
    .max(24)
    .regex(/^[A-Za-z0-9._-]*$/, 'Letters, numbers, dot, dash and underscore only')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  description: optionalShortText,
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema
  .omit({ type: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ── Categories ────────────────────────────────────────────────────────────────

/** Palette keys map to design-system tints; arbitrary colors are not accepted. */
export const CATEGORY_COLORS = ['blue', 'teal', 'amber', 'red', 'violet', 'green', 'slate', 'orange', 'pink', 'cyan'] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_ICONS = [
  'wrench',
  'zap',
  'droplets',
  'thermometer',
  'wind',
  'lightbulb',
  'monitor',
  'shield-alert',
  'hammer',
  'sparkles',
  'trees',
  'door-open',
  'flame',
  'plug',
  'armchair',
  'building',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: optionalShortText,
  color: z.enum(CATEGORY_COLORS).default('blue'),
  icon: z.enum(CATEGORY_ICONS).default('wrench'),
  defaultChecklistTemplateId: idSchema.nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export const updateCategorySchema = createCategorySchema.partial();

// ── Assets ────────────────────────────────────────────────────────────────────

const optionalDate = z
  .union([isoDateTime, z.iso.date()])
  .nullable()
  .optional();

export const createAssetSchema = z.object({
  name: z.string().trim().min(2).max(120),
  assetTag: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, digits and dashes'),
  categoryId: idSchema,
  locationId: idSchema,
  status: z.enum(ASSET_STATUSES).default('OPERATIONAL'),
  manufacturer: optionalShortText,
  model: optionalShortText,
  serialNumber: optionalShortText,
  installDate: optionalDate,
  warrantyExpiresAt: optionalDate,
  notes: optionalLongText,
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = createAssetSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

export const assetListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: queryList(ASSET_STATUSES).optional(),
  categoryId: idSchema.optional(),
  locationId: idSchema.optional(),
  sort: z.enum(['name', 'assetTag', 'status', 'createdAt', 'openWorkOrders']).default('name'),
  order: sortOrderSchema.default('asc'),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

// ── Checklist templates ───────────────────────────────────────────────────────

export const checklistItemInputSchema = z.object({
  label: z.string().trim().min(2).max(200),
  required: z.boolean().default(true),
});

export const createChecklistTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalShortText,
  items: z.array(checklistItemInputSchema).min(1).max(50),
});
export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;
export const updateChecklistTemplateSchema = createChecklistTemplateSchema.partial();

// ── Preventive maintenance schedules ──────────────────────────────────────────

export const createScheduleSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: optionalLongText,
    categoryId: idSchema,
    priority: z.enum(PRIORITIES).default('MEDIUM'),
    assetId: idSchema.nullable().optional(),
    locationId: idSchema.nullable().optional(),
    checklistTemplateId: idSchema.nullable().optional(),
    defaultAssigneeId: idSchema.nullable().optional(),
    frequencyUnit: z.enum(FREQUENCY_UNITS),
    frequencyInterval: z.number().int().min(1).max(365),
    startsAt: isoDateTime,
    leadTimeDays: z.number().int().min(0).max(30).default(0),
    active: z.boolean().default(true),
  })
  .refine((v) => v.assetId || v.locationId, {
    path: ['locationId'],
    message: 'Choose an asset or a location',
  });
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
