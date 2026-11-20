import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { equivalenceTrace } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The trace on which the revised design of the last check_equivalence differs. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => Response.json(await equivalenceTrace(identity, input.params.id)),
);
