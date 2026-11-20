import { ToolFileQuerySchema, ToolRunParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { runFile } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** One file's text as it was when the run started (the learner's own work). */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: ToolRunParamsSchema, query: ToolFileQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json({
      text: await runFile(identity, input.params.id, input.query.name),
    }),
);
