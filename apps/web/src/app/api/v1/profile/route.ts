import { ProfileSchema } from '@siliconbox/shared';
import { saveProfile } from '@/db/profiles';
import { withApiGate } from '@/server/api/with-api-gate';
import { AppError } from '@/server/errors';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Saves the learner's handle, bio and links. */
export const PUT = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: { body: ProfileSchema } },
  async ({ identity, input }) => {
    if ((await saveProfile(identity.userId, input.body)) === 'handle-taken') {
      throw new AppError('HANDLE_TAKEN', 'handle held by another learner');
    }
    return new Response(null, { status: 204 });
  },
);
