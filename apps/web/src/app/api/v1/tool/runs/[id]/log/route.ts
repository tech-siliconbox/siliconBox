import { ToolRunParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { runLog } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The run's lines of its session's log. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: ToolRunParamsSchema },
  },
  async ({ identity, input }) => Response.json(await runLog(identity, input.params.id)),
);
