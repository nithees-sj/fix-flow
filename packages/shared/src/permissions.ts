import type { Role } from './enums.js';

/**
 * Coarse-grained capabilities. Resource-level rules (own / assigned work orders,
 * org policy toggles) are layered on top in `workflow.ts` and the API services.
 */
export const PERMISSIONS = [
  'dashboard.read',
  'workOrder.create',
  'workOrder.readAll',
  'workOrder.readAssigned',
  'workOrder.update',
  'workOrder.assign',
  'workOrder.verify',
  'workOrder.close',
  'workOrder.internalNotes',
  'location.read',
  'location.manage',
  'asset.read',
  'asset.manage',
  'category.manage',
  'checklist.manage',
  'schedule.read',
  'schedule.manage',
  'sla.manage',
  'team.read',
  'team.manageSkills',
  'team.manage',
  'invitation.manage',
  'org.settings',
  'analytics.read',
  'report.export',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const REQUESTER: Permission[] = ['dashboard.read', 'workOrder.create', 'location.read', 'asset.read'];

const TECHNICIAN: Permission[] = [
  ...REQUESTER,
  'workOrder.readAssigned',
  'workOrder.internalNotes',
  'schedule.read',
];

const MANAGER: Permission[] = [
  ...TECHNICIAN,
  'workOrder.readAll',
  'workOrder.update',
  'workOrder.assign',
  'workOrder.verify',
  'workOrder.close',
  'checklist.manage',
  'schedule.manage',
  'sla.manage',
  'team.read',
  'team.manageSkills',
  'analytics.read',
  'report.export',
];

const ORG_ADMIN: Permission[] = [
  ...MANAGER,
  'location.manage',
  'asset.manage',
  'category.manage',
  'team.manage',
  'invitation.manage',
  'org.settings',
  'audit.read',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  REQUESTER: new Set(REQUESTER),
  TECHNICIAN: new Set(TECHNICIAN),
  MANAGER: new Set(MANAGER),
  ORG_ADMIN: new Set(ORG_ADMIN),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export const ROLE_LABELS: Record<Role, string> = {
  ORG_ADMIN: 'Organization admin',
  MANAGER: 'Manager',
  TECHNICIAN: 'Technician',
  REQUESTER: 'Requester',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ORG_ADMIN: 'Full control of organization settings, people, locations, assets and audit records.',
  MANAGER: 'Runs day-to-day operations: triages and assigns work, reviews resolutions, sees analytics.',
  TECHNICIAN: 'Works assigned jobs, records progress and checklists, submits resolution evidence.',
  REQUESTER: 'Reports issues, tracks their own requests and verifies completed repairs.',
};

/** Roles that may hold assignments. */
export const ASSIGNABLE_ROLES: readonly Role[] = ['TECHNICIAN'];

/** Roles considered "staff" (see internal notes, receive org-wide realtime events). */
export const STAFF_ROLES: readonly Role[] = ['ORG_ADMIN', 'MANAGER', 'TECHNICIAN'];
