import { z } from 'zod';
import { emailSchema, idSchema, passwordSchema, personNameSchema } from './common.js';

export const registerSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const switchOrganizationSchema = z.object({ organizationId: idSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  name: personNameSchema,
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9 ()-]*$/, 'Use digits, spaces and + ( ) - only')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
