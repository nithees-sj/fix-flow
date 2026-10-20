import type { Prisma } from '@fixflow/db';
import type { Role } from '@fixflow/shared';

export interface VisibilityPolicy {
  requesterSeesAllOrgRequests: boolean;
  technicianSelfAssign: boolean;
}

/**
 * Resource-level visibility of work orders inside one organization (RLS already confines
 * queries to the organization; this narrows them to what the role may see):
 *  - managers/admins: everything
 *  - technicians: jobs assigned to them now or previously, jobs they reported, and the
 *    open pool when self-assignment is enabled
 *  - requesters: their own requests (or all, if the org enables it)
 */
export function workOrderVisibility(
  actor: { userId: string; role: Role },
  policy: VisibilityPolicy,
): Prisma.WorkOrderWhereInput {
  switch (actor.role) {
    case 'ORG_ADMIN':
    case 'MANAGER':
      return {};
    case 'TECHNICIAN':
      return {
        OR: [
          { assigneeId: actor.userId },
          { requesterId: actor.userId },
          { assignments: { some: { assigneeId: actor.userId } } },
          ...(policy.technicianSelfAssign ? [{ status: 'OPEN' as const }] : []),
        ],
      };
    case 'REQUESTER':
      return policy.requesterSeesAllOrgRequests ? {} : { requesterId: actor.userId };
  }
}
