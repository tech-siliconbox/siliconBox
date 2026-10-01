import { z } from 'zod';

/** An Industry Ready service; admins switch it between open and locked without a deploy. */
export const ServiceStatusSchema = z.enum(['open', 'locked']);

export const PublicServiceSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().nullish(),
  status: ServiceStatusSchema,
  lockedReason: z.string().nullish(),
});
export type PublicService = z.infer<typeof PublicServiceSchema>;
