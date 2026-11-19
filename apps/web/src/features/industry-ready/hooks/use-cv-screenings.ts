'use client';

import {
  API_ROUTES,
  type CvScreening,
  NewScreeningSchema,
  type StoredCvFeedback,
  screeningOptions,
} from '@siliconbox/shared';
import { useState } from 'react';
import { useApiRequest } from './use-api-request';

/** The report on show; the text read from the file comes only with a screening just made. */
export type ShownScreening = { screening: CvScreening; atsText: string | null };

const fromHistory = (screening: CvScreening): ShownScreening => ({ screening, atsText: null });

/** Screening a file, the report on show, and the learner's saved reports with delete. */
export function useCvScreenings(initial: CvScreening[]) {
  const { pending, error, request } = useApiRequest();
  const [history, setHistory] = useState(initial);
  const [shown, setShown] = useState(initial[0] === undefined ? null : fromHistory(initial[0]));

  async function screen(file: File, jobDescription: string): Promise<void> {
    const form = new FormData();
    form.set('file', file);
    const options = screeningOptions(jobDescription);
    if (options.jobDescription !== undefined) form.set('jobDescription', options.jobDescription);
    const response = await request(API_ROUTES.cvScreenings, { method: 'POST', body: form });
    if (response === null) return;
    const created = NewScreeningSchema.parse(await response.json());
    setHistory([created.screening, ...history]);
    setShown(created);
  }

  /** Deletes one report, or all of them when `publicId` is omitted. */
  async function remove(publicId?: string): Promise<void> {
    const url =
      publicId === undefined ? API_ROUTES.cvScreenings : `${API_ROUTES.cvScreenings}/${publicId}`;
    if ((await request(url, { method: 'DELETE' })) === null) return;
    const left = publicId === undefined ? [] : history.filter((s) => s.publicId !== publicId);
    setHistory(left);
    if (shown !== null && !left.some((s) => s.publicId === shown.screening.publicId)) {
      setShown(null);
    }
  }

  /** Shows AI feedback on its screening, in the list and in the report on show. */
  function attachFeedback(publicId: string, feedback: StoredCvFeedback): void {
    const withFeedback = (s: CvScreening) => (s.publicId === publicId ? { ...s, feedback } : s);
    setHistory(history.map(withFeedback));
    if (shown !== null) setShown({ ...shown, screening: withFeedback(shown.screening) });
  }

  const view = (screening: CvScreening) => setShown(fromHistory(screening));

  return { pending, error, history, shown, view, screen, remove, attachFeedback };
}
