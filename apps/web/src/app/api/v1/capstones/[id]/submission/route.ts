import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { submitCapstone } from '@/server/capstones';
import { RATE_LIMITS } from '@/server/rate-limit';

/**
 * Uploads the learner's capstone project (one .zip of up to 10 MB) for an expert to grade,
 * replacing a submission still waiting for review. `submitCapstone` checks access for the
 * capstone's level and refuses once the capstone has passed.
 */
export const PUT = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.capstoneUpload,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input, request }) => {
    await submitCapstone(identity, input.params.id, request);
    return new Response(null, { status: 204 });
  },
);
