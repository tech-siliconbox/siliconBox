import { IdParamsSchema, ToolTraceQuerySchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { sessionTrace } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The trace of a property of the session, for the waveform. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema, query: ToolTraceQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json(await sessionTrace(identity, input.params.id, input.query.property)),
);
