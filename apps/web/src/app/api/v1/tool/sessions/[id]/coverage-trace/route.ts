import { IdParamsSchema, ToolCoverageTraceQuerySchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { coverageTrace } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The trace that reaches a coverage item of the session's last check_cov. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema, query: ToolCoverageTraceQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json(await coverageTrace(identity, input.params.id, input.query)),
);
