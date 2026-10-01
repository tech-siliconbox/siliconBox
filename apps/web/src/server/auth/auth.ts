import 'server-only';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
import { haveIBeenPwned, twoFactor } from 'better-auth/plugins';
import { getDb, getMongoClient } from '@/db/client';
import { getConfig } from '@/server/config';
import { onSessionCreated } from './on-session-created';

const MIN_PASSWORD_LENGTH = 10;

export function isGoogleSignInEnabled(): boolean {
  return getConfig().GOOGLE_CLIENT_ID !== undefined;
}

function googleProvider() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getConfig();
  if (GOOGLE_CLIENT_ID === undefined || GOOGLE_CLIENT_SECRET === undefined) return {};
  return { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } };
}

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: 'SiliconBox',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: mongodbAdapter(getDb(), { client: getMongoClient(), usePlural: true }),
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH },
    socialProviders: googleProvider(),
    user: {
      additionalFields: {
        // Admin roles are granted by an owner, never chosen at sign-up.
        role: { type: 'string', required: false, defaultValue: 'learner', input: false },
      },
    },
    databaseHooks: {
      session: { create: { after: onSessionCreated } },
    },
    // One rate limiter, not two: withDelegatedGate applies the Redis limits before Better Auth runs.
    rateLimit: { enabled: false },
    // Same client-IP headers as the API gate, so sessions record the address we rate-limit on.
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-real-ip'] } },
    plugins: [twoFactor({ issuer: 'SiliconBox' }), haveIBeenPwned(), nextCookies()],
  });
}

let cached: ReturnType<typeof createAuth> | undefined;

/** Created on first use so importing a route never needs the database or secrets. */
export function getAuth(): ReturnType<typeof createAuth> {
  cached ??= createAuth();
  return cached;
}
