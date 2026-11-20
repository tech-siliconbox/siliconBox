import { IdParamsSchema, ToolWhatIfSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { startWhatIf, whatIfResponse } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/**
 * A trace of a property with values pinned (or its quietest trace). It proves again within the
 * learner's ceilings, so a slow one answers 202 with the id to read its result by.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema, body: ToolWhatIfSchema },
  },
  async ({ identity, input }) =>
    whatIfResponse(await startWhatIf(identity, input.params.id, input.body)),
);
