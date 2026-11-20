import 'server-only';
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '@siliconbox/shared';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
import { haveIBeenPwned } from 'better-auth/plugins';
import { appendAudit } from '@/db/audit-log';
import { getDb, getMongoClient } from '@/db/client';
import { deleteLearnerData } from '@/db/learner-data';
import { closeOpenSession } from '@/server/praman/open-session';
import { getConfig } from '@/server/config';
import { type Email, sendEmail } from '@/server/email';
import { AppError } from '@/server/errors';
import { log } from '@/server/log';
import { passwordResetEmail, verificationEmail } from '@/server/account-emails';
import { onSessionCreated } from './on-session-created';

/** A name within the form's limit whatever the client (or Google's profile) sends. */
function fitName<T extends { name?: string }>(user: T): Promise<{ data: T }> {
  const data =
    user.name === undefined ? user : { ...user, name: user.name.trim().slice(0, MAX_NAME_LENGTH) };
  return Promise.resolve({ data });
}

export function isGoogleSignInEnabled(): boolean {
  return getConfig().GOOGLE_CLIENT_ID !== undefined;
}

function googleProvider() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getConfig();
  if (GOOGLE_CLIENT_ID === undefined || GOOGLE_CLIENT_SECRET === undefined) return {};
  return { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } };
}

const RESEND_PATH = '/send-verification-email';
type LinkRecipient = { user: { name: string; email: string }; url: string };

/** Sends an account email; a failure is logged, never shown, so no answer reveals an account. */
async function sendQuietly(email: Email, event: string): Promise<void> {
  try {
    await sendEmail(email);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    log('warn', event, { detail: error.detail });
  }
}

/**
 * Sends the verification link. At sign-up a failed send is logged and the account is still made
 * (the learner can ask again); asked for again from the account page, a failure is reported.
 */
async function sendVerificationLink(
  { user, url }: LinkRecipient,
  request?: Request,
): Promise<void> {
  const email = verificationEmail(user, url);
  const askedAgain = request !== undefined && new URL(request.url).pathname.endsWith(RESEND_PATH);
  await (askedAgain ? sendEmail(email) : sendQuietly(email, 'verification_email_not_sent'));
}

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: 'SiliconBox',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: mongodbAdapter(getDb(), { client: getMongoClient(), usePlural: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // The reset answer is the same whether or not the account exists, even if sending fails.
      sendResetPassword: ({ user, url }) =>
        sendQuietly(passwordResetEmail(user, url), 'password_reset_email_not_sent'),
      // A new password signs the account out everywhere.
      revokeSessionsOnPasswordReset: true,
    },
    // Verified before any purchase (access model). No sign-in from the link: opening it on
    // another device would sign this one out (one device at a time).
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: sendVerificationLink,
    },
    socialProviders: googleProvider(),
    user: {
      additionalFields: {
        // Admin roles are granted by an owner, never chosen at sign-up.
        role: { type: 'string', required: false, defaultValue: 'learner', input: false },
      },
      // DPDP: a learner deletes their account from Settings, with their password or, for a
      // Google account, a sign-in within the last day. Our data goes first, then the account.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await closeOpenSession(user.id);
          await deleteLearnerData(user.id);
        },
        afterDelete: (user) =>
          appendAudit({
            action: 'account_deleted',
            actorId: user.id,
            subjectId: user.id,
            createdAt: new Date(),
          }),
      },
    },
    databaseHooks: {
      user: { create: { before: fitName }, update: { before: fitName } },
      session: { create: { after: onSessionCreated } },
    },
    // One rate limiter, not two: withDelegatedGate applies the Redis limits before Better Auth runs.
    rateLimit: { enabled: false },
    // Same client-IP headers as the API gate, so sessions record the address we rate-limit on.
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-real-ip'] } },
    // A Google sign-in joins an existing account only when that account's email is verified
    // (Better Auth's default), so a password account made with someone else's email cannot
    // capture their Google sign-in.
    plugins: [haveIBeenPwned(), nextCookies()],
  });
}

let cached: ReturnType<typeof createAuth> | undefined;

/** Created on first use so importing a route never needs the database or secrets. */
export function getAuth(): ReturnType<typeof createAuth> {
  cached ??= createAuth();
  return cached;
}

/** Whether the signed-in account can sign in with a password (Google-only accounts cannot). */
export async function hasPassword(headers: Headers): Promise<boolean> {
  const accounts = await getAuth().api.listUserAccounts({ headers });
  return accounts.some((account) => account.providerId === 'credential');
}
