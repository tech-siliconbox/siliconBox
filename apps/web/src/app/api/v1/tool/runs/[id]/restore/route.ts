import { ToolRunParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { restoreRun } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** A new session with the run's files and its commands in restored_run.tcl. */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: ToolRunParamsSchema },
  },
  async ({ identity, input }) =>
    Response.json(await restoreRun(identity, input.params.id), { status: 201 }),
);
