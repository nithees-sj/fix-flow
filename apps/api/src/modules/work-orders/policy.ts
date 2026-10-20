import type { Tx } from '@fixflow/db';
import type { OrganizationPolicy } from '@fixflow/shared';

export type OrgPolicy = OrganizationPolicy & { timezone: string; name: string };

/** Current organization policy toggles, read inside the caller's transaction. */
export async function loadPolicy(tx: Tx, organizationId: string): Promise<OrgPolicy> {
  return tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      name: true,
      timezone: true,
      requesterCanVerify: true,
      technicianSelfAssign: true,
      requesterSeesAllOrgRequests: true,
      requireEvidencePhoto: true,
      reopenWindowDays: true,
      autoCloseDays: true,
      autoAssignMode: true,
      qrReportingMode: true,
    },
  });
}
