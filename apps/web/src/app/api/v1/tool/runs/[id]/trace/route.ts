import { ToolRunParamsSchema, ToolTraceQuerySchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { runTrace } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** A kept trace of one property of a run. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: ToolRunParamsSchema, query: ToolTraceQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json(await runTrace(identity, input.params.id, input.query.property)),
);
