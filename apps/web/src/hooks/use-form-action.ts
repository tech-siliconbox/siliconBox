'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** A form action's outcome: no error, or the message to show. */
export type FormResult = { error: { message?: string | undefined } | null };

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

/**
 * Pending and error state for one form action, then navigation to `next` on success.
 * Pass null to stay on the page (or when the auth library navigates by itself).
 * `run` resolves to whether the call succeeded.
 */
export function useFormAction(next: string | null) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<FormResult>): Promise<boolean> {
    setPending(true);
    setError(null);
    const result: FormResult = await action().catch(() => ({ error: { message: FALLBACK_ERROR } }));
    setPending(false);
    if (result.error !== null) {
      setError(result.error.message ?? FALLBACK_ERROR);
      return false;
    }
    if (next !== null) {
      router.push(next);
      router.refresh();
    }
    return true;
  }

  return { pending, error, run };
}
