import { IdParamsSchema, ToolDriversQuerySchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { traceDrivers } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/** What set a signal's value at a cycle of a property's trace. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema, query: ToolDriversQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json(await traceDrivers(identity, input.params.id, input.query)),
);
