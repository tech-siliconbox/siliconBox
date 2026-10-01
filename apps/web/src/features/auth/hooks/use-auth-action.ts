'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** An auth call's outcome. `next` overrides where to go on success (for example, the code step). */
export type AuthResult = { error: { message?: string | undefined } | null; next?: string };

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

/**
 * Pending and error state for one auth call, then navigation to `next` on success.
 * Pass null to stay on the page (or when the auth library navigates by itself).
 * `run` resolves to whether the call succeeded.
 */
export function useAuthAction(next: string | null) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<AuthResult>): Promise<boolean> {
    setPending(true);
    setError(null);
    const result: AuthResult = await action().catch(() => ({ error: { message: FALLBACK_ERROR } }));
    setPending(false);
    if (result.error !== null) {
      setError(result.error.message ?? FALLBACK_ERROR);
      return false;
    }
    const destination = result.next ?? next;
    if (destination !== null) {
      router.push(destination);
      router.refresh();
    }
    return true;
  }

  return { pending, error, run };
}
