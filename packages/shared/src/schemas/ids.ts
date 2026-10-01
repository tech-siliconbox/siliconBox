import { z } from 'zod';

/** Better Auth user ids are opaque strings; bound the length so they cannot carry payloads. */
export const UserIdSchema = z.string().min(1).max(64);
export type UserId = z.infer<typeof UserIdSchema>;
