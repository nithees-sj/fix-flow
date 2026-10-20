import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

/** Authenticated tenant context. Always derived server-side from a verified membership. */
export interface TenantContext {
  organizationId: string;
  /** The acting user; null for system automation running inside a tenant (worker jobs). */
  userId: string | null;
}

/** Interactive-transaction client handed to service code. */
export type Tx = Prisma.TransactionClient;

export interface DatabaseOptions {
  /** Runtime role with RLS enforced (fixflow_app). */
  appUrl: string;
  /** BYPASSRLS role (fixflow_system) for audited cross-tenant paths. */
  systemUrl: string;
  poolSize?: number;
  onPoolError?: (err: Error) => void;
}

export interface TxOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Milliseconds; Prisma's default (5s) is too tight for imports/exports. */
  timeout?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPrismaClient(url: string, poolSize = 10, onPoolError?: (err: Error) => void) {
  const adapter = new PrismaPg({ connectionString: url, max: poolSize }, { onPoolError });
  return new PrismaClient({ adapter });
}

/**
 * Entry point for all database access.
 *
 *  - `tx(ctx, fn)`  runs `fn` in a transaction on the RLS-enforced connection after setting
 *                   `app.org_id` / `app.user_id` with `set_config(..., is_local => true)`.
 *                   The settings vanish at COMMIT/ROLLBACK, so pooled connections never leak
 *                   tenant context between requests.
 *  - `userTx(userId, fn)` same, for user-scoped data that is not inside an organization
 *                   (own sessions, own memberships list, profile).
 *  - `system`       BYPASSRLS client. Every use is listed in docs/SECURITY.md (“system paths”).
 *
 * Queries issued on the app client *outside* `tx` see no tenant rows at all (fail closed).
 */
export class Database {
  readonly app: PrismaClient;
  readonly system: PrismaClient;

  constructor(opts: DatabaseOptions) {
    this.app = createPrismaClient(opts.appUrl, opts.poolSize, opts.onPoolError);
    this.system = createPrismaClient(opts.systemUrl, Math.max(2, Math.floor((opts.poolSize ?? 10) / 2)), opts.onPoolError);
  }

  async tx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
    assertUuid(ctx.organizationId, 'organizationId');
    if (ctx.userId !== null) assertUuid(ctx.userId, 'userId');
    return this.app.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', ${ctx.organizationId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
        return fn(tx);
      },
      { timeout: opts.timeout ?? 15_000, maxWait: 5_000, isolationLevel: opts.isolationLevel },
    );
  }

  async userTx<T>(userId: string, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
    assertUuid(userId, 'userId');
    return this.app.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', '', true), set_config('app.user_id', ${userId}, true)`;
        return fn(tx);
      },
      { timeout: opts.timeout ?? 15_000, maxWait: 5_000, isolationLevel: opts.isolationLevel },
    );
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.app.$disconnect(), this.system.$disconnect()]);
  }
}

function assertUuid(value: string, name: string): void {
  if (!UUID_RE.test(value)) throw new Error(`Invalid tenant context: ${name} is not a UUID`);
}
