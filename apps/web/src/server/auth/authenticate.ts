import 'server-only';
import { type Role, RoleSchema } from '@siliconbox/shared';
import { getSessionCookie } from 'better-auth/cookies';
import { wasReplaced } from '@/db/ended-sessions';
import { AppError } from '@/server/errors';
import { getAuth } from './auth';

export type Identity = {
  userId: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
};

/** Resolves the signed-in learner from the session cookie, checked against the database. */
export async function authenticate(headers: Headers): Promise<Identity> {
  const result = await getAuth().api.getSession({ headers });
  if (result !== null) {
    return {
      userId: result.user.id,
      email: result.user.email,
      role: RoleSchema.parse(result.user.role),
      emailVerified: result.user.emailVerified,
      twoFactorEnabled: result.user.twoFactorEnabled === true,
    };
  }
  throw new AppError((await endedByNewerSignIn(headers)) ? 'SESSION_REPLACED' : 'UNAUTHENTICATED');
}

async function endedByNewerSignIn(headers: Headers): Promise<boolean> {
  // The cookie holds "<token>.<signature>"; only the token is recorded when a session is replaced.
  const token = getSessionCookie(headers)?.split('.')[0];
  return token !== undefined && token !== '' && (await wasReplaced(token));
}
