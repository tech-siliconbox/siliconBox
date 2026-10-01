import { z } from 'zod';
import { UserIdSchema } from './ids';
import { LevelSchema } from './level';

const windowFields = {
  startsAt: z.date(),
  endsAt: z.date(),
};

function endsAfterStart(window: { startsAt: Date; endsAt: Date }): boolean {
  return window.endsAt > window.startsAt;
}
const endsAfterStartIssue = { message: 'endsAt must be after startsAt', path: ['endsAt'] };

export const WindowSchema = z
  .strictObject(windowFields)
  .refine(endsAfterStart, endsAfterStartIssue);
export type Window = z.infer<typeof WindowSchema>;

/** Access comes only from a verified order or an audited admin grant with a reason. */
function withSource<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  return z.discriminatedUnion('source', [
    schema.extend({ source: z.literal('order'), orderId: z.string().min(1).max(64) }),
    schema.extend({ source: z.literal('admin'), reason: z.string().trim().min(3).max(500) }),
  ]);
}

const EntitlementBase = z.strictObject({ userId: UserIdSchema, ...windowFields });

export const EntitlementSchema = z
  .discriminatedUnion('kind', [
    withSource(EntitlementBase.extend({ kind: z.literal('content'), level: LevelSchema })),
    withSource(EntitlementBase.extend({ kind: z.literal('tool') })),
  ])
  .refine(endsAfterStart, endsAfterStartIssue);
export type Entitlement = z.infer<typeof EntitlementSchema>;
