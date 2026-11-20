import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { closeSession, openSession } from '@/server/praman/sessions';
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

/** Closes the session on the formal tool when its page goes away; its work stays saved. */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    await closeSession(identity, input.params.id);
    return new Response(null, { status: 204 });
  },
);
