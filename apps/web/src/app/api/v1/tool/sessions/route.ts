import { ToolSessionNameSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { createSession, listSessions } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The learner's Praman sessions, most recently used first (ADR 0031). */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async ({ identity }) => Response.json(await listSessions(identity)),
);

/** Starts a new, empty session; a learner keeps up to 20. */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { body: ToolSessionNameSchema },
  },
  async ({ identity, input }) =>
    Response.json(await createSession(identity, input.body.name), { status: 201 }),
);
