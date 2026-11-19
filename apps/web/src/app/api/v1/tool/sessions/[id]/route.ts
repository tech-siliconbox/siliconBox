import { IdParamsSchema, ToolSessionNameSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { deleteSession, renameSession } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Renames a session. */
export const PATCH = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: IdParamsSchema, body: ToolSessionNameSchema },
  },
  async ({ identity, input }) => {
    await renameSession(identity, input.params.id, input.body.name);
    return new Response(null, { status: 204 });
  },
);

/** Deletes a session with its runs (personal data, DPDP: allowed once access has ended). */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    await deleteSession(identity, input.params.id);
    return new Response(null, { status: 204 });
  },
);
