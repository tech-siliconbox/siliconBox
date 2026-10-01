import 'server-only';
import { authenticate } from '@/server/auth/authenticate';
import { getConfig } from '@/server/config';
import { assertEntitled } from '@/server/entitlements';
import { redisRateLimiter } from '@/server/rate-limit';
import { createApiGate } from './gate';

export const { withApiGate, withDelegatedGate } = createApiGate({
  authenticate,
  assertEntitled: (resource, identity) => assertEntitled(resource, identity),
  rateLimiter: redisRateLimiter,
  allowedOrigins: () => [new URL(getConfig().BETTER_AUTH_URL).origin],
});
