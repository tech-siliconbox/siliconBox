import 'server-only';
import { PublicIdSchema } from '@siliconbox/shared';
import { z } from 'zod';
import type { Identity } from '@/server/auth/authenticate';
import { RATE_LIMITS } from '@/server/rate-limit';
import { withApiGate } from './with-api-gate';

/**
 * A GET route that returns one paid item by its public id. `read` must pace the read and call
 * assertEntitled for that exact item (as readLesson and readAnswer do).
 */
export function paidReadRoute(read: (identity: Identity, id: string) => Promise<unknown>) {
  return withApiGate(
    {
      access: { kind: 'signedIn' },
      rateLimit: RATE_LIMITS.read,
      schemas: { params: z.strictObject({ id: PublicIdSchema }) },
    },
    async ({ identity, input }) => Response.json(await read(identity, input.params.id)),
  );
}
