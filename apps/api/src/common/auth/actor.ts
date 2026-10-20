import type { TenantContext } from '@fixflow/db';
import type { Permission, Role } from '@fixflow/shared';

/** Result of authenticating the access token (no organization guarantees yet). */
export interface AuthState {
  userId: string;
  sessionId: string;
  /** Active organization claimed by the token; only trusted after TenantGuard verifies membership. */
  organizationId: string | null;
  via: 'cookie' | 'bearer';
}

/** A verified member acting inside an organization. Built by TenantGuard on every request. */
export interface Actor {
  userId: string;
  sessionId: string;
  organizationId: string;
  membershipId: string;
  role: Role;
  permissions: ReadonlySet<Permission>;
  /** Tenant context handed to Database.tx — derived only from verified server-side state. */
  ctx: TenantContext;
  ip: string | null;
  userAgent: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthState;
      actor?: Actor;
    }
  }
}
