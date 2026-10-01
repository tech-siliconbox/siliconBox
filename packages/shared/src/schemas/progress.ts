import { z } from 'zod';
import { PublicIdSchema } from './lesson';

/** Body of `POST /api/v1/progress`: mark one lesson done or not done. */
export const ProgressInputSchema = z.strictObject({
  lessonId: PublicIdSchema,
  done: z.boolean(),
});
export type ProgressInput = z.infer<typeof ProgressInputSchema>;
