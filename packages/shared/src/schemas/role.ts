import { z } from 'zod';

export const AdminRoleSchema = z.enum(['author', 'editor', 'support', 'owner']);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const RoleSchema = z.enum(['learner', ...AdminRoleSchema.options]);
export type Role = z.infer<typeof RoleSchema>;
