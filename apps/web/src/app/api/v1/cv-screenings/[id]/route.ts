import { z } from 'zod';
import { deleteScreenings } from '@/db/cv-screenings';
import { withApiGate } from '@/server/api/with-api-gate';
import { AppError } from '@/server/errors';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Deletes one of the learner's own screening reports; another learner's id is simply not found. */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: z.strictObject({ id: z.uuid() }) },
  },
  async ({ identity, input }) => {
    const deleted = await deleteScreenings(identity.userId, input.params.id);
    if (deleted === 0) throw new AppError('NOT_FOUND', `screening ${input.params.id}`);
    return new Response(null, { status: 204 });
  },
);
