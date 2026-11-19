import { IdParamsSchema, ToolPollQuerySchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { pollSession } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** New log lines after `after`, and the session's state when it moved past `version`. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolPoll,
    schemas: { params: IdParamsSchema, query: ToolPollQuerySchema },
  },
  async ({ identity, input }) =>
    Response.json(await pollSession(identity, input.params.id, input.query)),
);
