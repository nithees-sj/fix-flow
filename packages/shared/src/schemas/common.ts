import { z } from 'zod';

export const idSchema = z.uuid({ message: 'Invalid identifier' });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }).max(254));

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

export const personNameSchema = z.string().trim().min(2, 'Enter your full name').max(80);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const optionalShortText = optionalText(200);
export const optionalLongText = optionalText(4000);

/** Query-string boolean: "true"/"false"/"1"/"0". */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Comma-separated query list → array of enum values. */
export function queryList<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).max(values.length));
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const isoDateTime = z.iso.datetime({ offset: true });

/** IANA time zone validated against the runtime's tz database. */
export const timeZoneSchema = z
  .string()
  .min(1)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

export const expectedVersionSchema = z.number().int().min(1);

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}
