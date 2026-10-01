import { toNextJsHandler } from 'better-auth/next-js';
import { withDelegatedGate } from '@/server/api/with-api-gate';
import { getAuth } from '@/server/auth/auth';
import { RATE_LIMITS } from '@/server/rate-limit';

// Better Auth validates its own bodies and checks sessions; we add origin and rate limits.
const handlers = () => toNextJsHandler(getAuth());

export const GET = withDelegatedGate(RATE_LIMITS.read, (request) => handlers().GET(request));
export const POST = withDelegatedGate(RATE_LIMITS.authWrite, (request) => handlers().POST(request));
