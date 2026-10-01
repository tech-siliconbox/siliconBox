import { PublicIdSchema } from '@siliconbox/shared';
import { z } from 'zod';
import { withApiGate } from '@/server/api/with-api-gate';
import { readLesson } from '@/server/lessons';
import { RATE_LIMITS } from '@/server/rate-limit';

/**
 * One published lesson as blocks. `readLesson` paces reads and calls assertEntitled for this
 * exact lesson's level; the response is private, no-store (the gate's default).
 */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: z.strictObject({ id: PublicIdSchema }) },
  },
  async ({ identity, input }) => Response.json(await readLesson(identity, input.params.id)),
);
