import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { openSession } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Opens the session on the formal tool; it may wait in line for a free place first. */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    const place = await openSession(identity, input.params.id);
    return Response.json(place, { status: place.state === 'open' ? 200 : 202 });
  },
);
