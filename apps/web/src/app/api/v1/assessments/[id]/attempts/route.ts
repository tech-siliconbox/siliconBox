import { AttemptInputSchema } from '@siliconbox/shared';
import { z } from 'zod';
import { withApiGate } from '@/server/api/with-api-gate';
import { submitAttempt } from '@/server/assessments';
import { RATE_LIMITS } from '@/server/rate-limit';

/**
 * Submits one attempt at an assessment: an answer for every question. The server scores it
 * against the hidden key; only the score comes back (ADR 0029). `submitAttempt` checks access
 * for the assessment's level and the attempt limit.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: z.strictObject({ id: z.uuid() }), body: AttemptInputSchema },
  },
  async ({ identity, input }) =>
    Response.json(await submitAttempt(identity, input.params.id, input.body.answers), {
      status: 201,
    }),
);
