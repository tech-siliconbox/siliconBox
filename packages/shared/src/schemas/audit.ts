import { z } from 'zod';
import { UserIdSchema } from './ids';

export const AuditActionSchema = z.enum([
  'sign_in',
  'session_replaced',
  'purchase',
  'refund',
  'admin_edit',
  'entitlement_change',
  // An admin traced leaked text back to learner accounts (docs/security/watermarking.md).
  'watermark_trace',
  // A learner downloaded their data, or deleted their account (DPDP).
  'data_export',
  'account_deleted',
  // An expert graded a learner's capstone project (ADR 0029).
  'capstone_graded',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** Flat, operator-free metadata: keys cannot start with `$` or contain `.`. */
const AuditMetadataSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
);

export const AuditEntrySchema = z.strictObject({
  action: AuditActionSchema,
  actorId: UserIdSchema.nullable(),
  subjectId: UserIdSchema.nullable(),
  reason: z.string().trim().max(500).optional(),
  metadata: AuditMetadataSchema.optional(),
  createdAt: z.date(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
