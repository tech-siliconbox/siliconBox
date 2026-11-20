import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { stopProof } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Stops the running proof. */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) =>
    Response.json({ stopped: await stopProof(identity, input.params.id) }),
);
