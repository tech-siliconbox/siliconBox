import { z } from 'zod';
import { withApiGate } from '@/server/api/with-api-gate';
import { RATE_LIMITS } from '@/server/rate-limit';
import { readRun } from '@/server/runs';

/** One of the learner's own runs; another learner's id is simply not found. Poll 1 s, 2 s, 5 s. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: z.strictObject({ id: z.uuid() }) },
  },
  async ({ identity, input }) => Response.json(await readRun(identity, input.params.id)),
);
