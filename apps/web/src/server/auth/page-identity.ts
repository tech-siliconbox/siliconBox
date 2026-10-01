import 'server-only';
import { ROUTES, SIGNED_OUT_ELSEWHERE } from '@siliconbox/shared';
import { getSessionCookie } from 'better-auth/cookies';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { AppError } from '@/server/errors';
import { type Identity, authenticate } from './authenticate';

/** The signed-in learner for a page render, looked up once per request; otherwise sign-in. */
export const requirePageIdentity = cache(async (): Promise<Identity> => {
  try {
    return await authenticate(await headers());
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const reason = error.code === 'SESSION_REPLACED' ? `?reason=${SIGNED_OUT_ELSEWHERE}` : '';
    redirect(`${ROUTES.signIn}${reason}`);
  }
});

/** The signed-in learner if there is one, for public pages that add personal details. */
export const optionalPageIdentity = cache(async (): Promise<Identity | null> => {
  const requestHeaders = await headers();
  if (getSessionCookie(requestHeaders) === null) return null;
  return authenticate(requestHeaders).catch((error: unknown) => {
    if (error instanceof AppError) return null;
    throw error;
  });
});
