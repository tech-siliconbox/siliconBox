import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { loadExample } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Adds Praman's example design (a FIFO with a bug, and properties that catch it). */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    await loadExample(identity, input.params.id);
    return new Response(null, { status: 204 });
  },
);
