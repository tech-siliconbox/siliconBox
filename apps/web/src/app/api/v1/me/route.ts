import { withApiGate } from '@/server/api/with-api-gate';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The signed-in account. Open pages also poll this to notice a sign-in on another device. */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  ({ identity }) =>
    Promise.resolve(
      Response.json({
        id: identity.userId,
        role: identity.role,
        emailVerified: identity.emailVerified,
      }),
    ),
);
