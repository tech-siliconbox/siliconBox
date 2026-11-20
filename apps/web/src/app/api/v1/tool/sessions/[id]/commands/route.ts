import { IdParamsSchema, ToolCommandSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { runCommand } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/**
 * One line for the session's Tcl console. The line is the learner's own; the server sends their
 * level's ceilings with it, which the session enforces wherever an engine starts (ADR 0031).
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema, body: ToolCommandSchema },
  },
  async ({ identity, input }) => {
    await runCommand(identity, input.params.id, input.body.line);
    return new Response(null, { status: 202 });
  },
);
