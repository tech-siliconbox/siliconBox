import { ToolWhatIfParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { readWhatIf, whatIfResponse } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/** A what-if started before: 200 with its result once proven, else 202 again. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolPoll,
    schemas: { params: ToolWhatIfParamsSchema },
  },
  async ({ identity, input }) =>
    whatIfResponse(await readWhatIf(identity, input.params.id, input.params.requestId)),
);
