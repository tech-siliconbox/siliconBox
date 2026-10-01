'use client';

import { API_ROUTES, type CvScreening, CvScreeningSchema, ERRORS } from '@siliconbox/shared';
import { useState } from 'react';

async function errorMessage(response: Response | null): Promise<string> {
  const body = (await response?.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? ERRORS.INTERNAL.message;
}

/** Screening a file, the report on show, and the learner's saved reports with delete. */
export function useCvScreenings(initial: CvScreening[]) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(initial);
  const [shown, setShown] = useState<CvScreening | null>(initial[0] ?? null);

  async function screen(file: File): Promise<void> {
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set('file', file);
    const response = await fetch(API_ROUTES.cvScreenings, { method: 'POST', body: form }).catch(
      () => null,
    );
    setPending(false);
    if (response?.status !== 201) {
      setError(await errorMessage(response));
      return;
    }
    const screening = CvScreeningSchema.parse(await response.json());
    setHistory([screening, ...history]);
    setShown(screening);
  }

  /** Deletes one report, or all of them when `publicId` is omitted. */
  async function remove(publicId?: string): Promise<void> {
    const url =
      publicId === undefined ? API_ROUTES.cvScreenings : `${API_ROUTES.cvScreenings}/${publicId}`;
    const response = await fetch(url, { method: 'DELETE' }).catch(() => null);
    if (response?.ok !== true) {
      setError(await errorMessage(response));
      return;
    }
    const left = publicId === undefined ? [] : history.filter((s) => s.publicId !== publicId);
    setHistory(left);
    if (shown !== null && !left.includes(shown)) setShown(null);
  }

  return { pending, error, history, shown, setShown, screen, remove };
}
