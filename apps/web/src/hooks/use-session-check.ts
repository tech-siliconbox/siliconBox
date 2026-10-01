'use client';

import { API_ROUTES, type ErrorCode } from '@siliconbox/shared';
import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Re-checks the session every minute and on tab focus. Calls `onEnded` with the reason when
 * the server no longer accepts it (for example, a sign-in on another device replaced it).
 */
export function useSessionCheck(onEnded: (code: ErrorCode) => void): void {
  useEffect(() => {
    let stopped = false;
    async function check() {
      // A network blip is not a sign-out; the next tick tries again.
      const response = await fetch(API_ROUTES.me, { cache: 'no-store' }).catch(() => null);
      if (stopped || response?.status !== 401) return;
      const body = (await response.json()) as { error: { code: ErrorCode } };
      onEnded(body.error.code);
    }
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [onEnded]);
}
