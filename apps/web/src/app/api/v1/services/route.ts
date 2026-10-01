import { findServices } from '@/db/services';
import { withApiGate } from '@/server/api/with-api-gate';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The Industry Ready list with each service's status. Anyone may read it. */
export const GET = withApiGate(
  { access: { kind: 'public' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async () => Response.json({ services: await findServices() }),
);
