'use client';

import {
  AI_NOTICE_VERSION,
  API_ROUTES,
  type StoredCvFeedback,
  StoredCvFeedbackSchema,
  screeningOptions,
} from '@siliconbox/shared';
import { useApiRequest } from './use-api-request';

type OnGiven = (screeningId: string, feedback: StoredCvFeedback) => void;

/** Asks for AI feedback on a saved screening, naming the notice the learner agreed to. */
export function useCvFeedback(onGiven: OnGiven) {
  const { pending, error, request } = useApiRequest();

  async function ask(screeningId: string, jobDescription: string): Promise<void> {
    const response = await request(API_ROUTES.cvScreeningFeedback(screeningId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...screeningOptions(jobDescription),
        consentedNotice: AI_NOTICE_VERSION,
      }),
    });
    if (response !== null)
      onGiven(screeningId, StoredCvFeedbackSchema.parse(await response.json()));
  }

  return { pending, error, ask };
}
