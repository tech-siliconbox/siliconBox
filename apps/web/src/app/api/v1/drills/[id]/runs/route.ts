import { RunInputSchema } from '@siliconbox/shared';
import { z } from 'zod';
import { withApiGate } from '@/server/api/with-api-gate';
import { RATE_LIMITS } from '@/server/rate-limit';
import { startRun } from '@/server/runs';

/**
 * Start a run of the learner's properties on a Drill. Only code comes from the browser; the
 * Drill supplies design, mode, solver, depth, timeout and top module. `startRun` checks content
 * and tool access for the Drill's level and the daily quota.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.runStart,
    schemas: { params: z.strictObject({ id: z.uuid() }), body: RunInputSchema },
  },
  async ({ identity, input }) => {
    const run = await startRun(identity, input.params.id, input.body);
    return Response.json(run, { status: run.state === 'done' ? 200 : 202 });
  },
);
