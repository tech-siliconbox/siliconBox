import { ToolRunParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { deleteRun, readRun } from '@/server/praman/runs';
import { RATE_LIMITS } from '@/server/rate-limit';

/** One run: how it was set up, its files and each property's result. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: ToolRunParamsSchema },
  },
  async ({ identity, input }) => Response.json(await readRun(identity, input.params.id)),
);

/** Deletes a run and its traces (personal data, DPDP: allowed once access has ended). */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: ToolRunParamsSchema },
  },
  async ({ identity, input }) => {
    await deleteRun(identity, input.params.id);
    return new Response(null, { status: 204 });
  },
);
