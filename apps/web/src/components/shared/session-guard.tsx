'use client';

import { ROUTES, SIGNED_OUT_ELSEWHERE } from '@siliconbox/shared';
import { useCallback } from 'react';
import { useSessionCheck } from '@/hooks/use-session-check';

/** Sends the learner to sign-in, with the reason, as soon as their session stops being valid. */
export function SessionGuard() {
  const onEnded = useCallback((code: string) => {
    const reason = code === 'SESSION_REPLACED' ? `?reason=${SIGNED_OUT_ELSEWHERE}` : '';
    // A full page load, not a client transition, so the router cache drops any paid pages.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${ROUTES.signIn}${reason}`);
  }, []);
  useSessionCheck(onEnded);
  return null;
}
