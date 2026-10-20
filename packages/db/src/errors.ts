import { Prisma } from '../generated/prisma/client.js';

const isKnown = (e: unknown): e is Prisma.PrismaClientKnownRequestError =>
  e instanceof Prisma.PrismaClientKnownRequestError;

/** Unique constraint violation (P2002), optionally on a specific constraint/field set. */
export function isUniqueViolation(e: unknown): boolean {
  if (isKnown(e) && e.code === 'P2002') return true;
  return pgCode(e) === '23505';
}

/** Foreign key violation — with composite tenant FKs this also signals a cross-tenant reference. */
export function isForeignKeyViolation(e: unknown): boolean {
  if (isKnown(e) && e.code === 'P2003') return true;
  return pgCode(e) === '23503';
}

/** Row-level security WITH CHECK rejection. */
export function isRlsViolation(e: unknown): boolean {
  return pgCode(e) === '42501' || /row-level security/i.test(String((e as Error)?.message ?? ''));
}

export function isCheckViolation(e: unknown): boolean {
  return pgCode(e) === '23514';
}

/** "Record to update/delete not found" (P2025). */
export function isNotFound(e: unknown): boolean {
  return isKnown(e) && e.code === 'P2025';
}

function pgCode(e: unknown): string | undefined {
  // Driver-adapter errors surface the original Postgres SQLSTATE in a few shapes.
  const err = e as { code?: unknown; meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } }; cause?: { code?: unknown } };
  const candidates = [
    err?.meta?.driverAdapterError?.cause?.originalCode,
    err?.meta?.code,
    err?.cause?.code,
    err?.code,
  ];
  for (const c of candidates) if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) return c;
  return undefined;
}
