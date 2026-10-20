import { z } from 'zod';
import {
  AUTO_ASSIGN_MODES,
  INDUSTRIES,
  MEMBERSHIP_STATUSES,
  NOTIFICATION_TYPES,
  PRIORITIES,
  QR_REPORTING_MODES,
  ROLES,
} from '../enums.js';
import {
  emailSchema,
  idSchema,
  paginationSchema,
  passwordSchema,
  personNameSchema,
  timeZoneSchema,
} from './common.js';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Enter your organization name').max(100),
  industry: z.enum(INDUSTRIES),
  timezone: timeZoneSchema,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = createOrganizationSchema.partial();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const organizationPolicySchema = z.object({
  requesterCanVerify: z.boolean(),
  technicianSelfAssign: z.boolean(),
  requesterSeesAllOrgRequests: z.boolean(),
  requireEvidencePhoto: z.boolean(),
  reopenWindowDays: z.number().int().min(0).max(90),
  autoCloseDays: z.number().int().min(1).max(90),
  autoAssignMode: z.enum(AUTO_ASSIGN_MODES),
  qrReportingMode: z.enum(QR_REPORTING_MODES),
});
export type OrganizationPolicy = z.infer<typeof organizationPolicySchema>;
export const updateOrganizationPolicySchema = organizationPolicySchema.partial();

export const DEFAULT_ORGANIZATION_POLICY: OrganizationPolicy = {
  requesterCanVerify: true,
  technicianSelfAssign: false,
  requesterSeesAllOrgRequests: false,
  requireEvidencePhoto: true,
  reopenWindowDays: 7,
  autoCloseDays: 7,
  autoAssignMode: 'SUGGEST',
  qrReportingMode: 'AUTHENTICATED',
};

// ── Team ──────────────────────────────────────────────────────────────────────

export const memberListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(ROLES),
    status: z.enum(MEMBERSHIP_STATUSES),
    jobTitle: z.string().trim().max(80).nullable(),
    isAvailable: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const setSkillsSchema = z.object({
  skills: z
    .array(z.object({ categoryId: idSchema, level: z.number().int().min(1).max(3) }))
    .max(30)
    .refine((s) => new Set(s.map((x) => x.categoryId)).size === s.length, 'Duplicate category'),
});
export type SetSkillsInput = z.infer<typeof setSkillsSchema>;

export const createInvitationsSchema = z.object({
  invitations: z
    .array(z.object({ email: emailSchema, role: z.enum(ROLES) }))
    .min(1)
    .max(20)
    .refine((s) => new Set(s.map((x) => x.email)).size === s.length, 'Duplicate email'),
});
export type CreateInvitationsInput = z.infer<typeof createInvitationsSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  /** Required only when the invited email has no FixFlow account yet. */
  name: personNameSchema.optional(),
  password: passwordSchema.optional(),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

// ── SLA & notifications ───────────────────────────────────────────────────────

export const slaPolicySchema = z
  .object({
    priority: z.enum(PRIORITIES),
    responseMinutes: z.number().int().min(5).max(60 * 24 * 30),
    resolutionMinutes: z.number().int().min(10).max(60 * 24 * 90),
    warningPercent: z.number().int().min(50).max(95),
    escalationEnabled: z.boolean(),
    description: z.string().trim().max(240).default(''),
  })
  .refine((p) => p.resolutionMinutes >= p.responseMinutes, {
    path: ['resolutionMinutes'],
    message: 'Resolution target must be at least the response target',
  });
export type SlaPolicyInput = z.infer<typeof slaPolicySchema>;

export const updateSlaPoliciesSchema = z.object({
  policies: z
    .array(slaPolicySchema)
    .length(PRIORITIES.length)
    .refine((p) => new Set(p.map((x) => x.priority)).size === PRIORITIES.length, 'One policy per priority'),
});
export type UpdateSlaPoliciesInput = z.infer<typeof updateSlaPoliciesSchema>;

export const notificationPreferencesSchema = z.object({
  preferences: z
    .array(z.object({ type: z.enum(NOTIFICATION_TYPES), inApp: z.boolean(), email: z.boolean() }))
    .max(NOTIFICATION_TYPES.length),
});
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
