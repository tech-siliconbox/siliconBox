import { ToolRunDiffQuerySchema, ToolRunParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { diffRun } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Properties whose result changed since another run (by default the session's one before). */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: ToolRunParamsSchema, query: ToolRunDiffQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json(await diffRun(identity, input.params.id, input.query.against)),
);
