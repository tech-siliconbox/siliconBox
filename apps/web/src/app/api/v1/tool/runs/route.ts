import { withApiGate } from '@/server/api/with-api-gate';
import { listRuns } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The learner's Praman runs, newest first (the last 50 are kept). */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async ({ identity }) => Response.json(await listRuns(identity)),
);
