'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api-error';

/** Pending and error state around calls to our API; a call returns the response only if it succeeded. */
export function useApiRequest() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(url: string, init: RequestInit): Promise<Response | null> {
    setPending(true);
    setError(null);
    const response = await fetch(url, init).catch(() => null);
    setPending(false);
    if (response?.ok === true) return response;
    setError(await errorMessage(response));
    return null;
  }

  return { pending, error, request };
}
