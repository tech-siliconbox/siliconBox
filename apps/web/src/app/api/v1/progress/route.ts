import { ProgressInputSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { recordProgress } from '@/server/progress';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Mark a lesson done or not done; `recordProgress` checks the lesson and the learner's access. */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { body: ProgressInputSchema },
  },
  async ({ identity, input }) => {
    await recordProgress(identity, input.body);
    return new Response(null, { status: 204 });
  },
);
