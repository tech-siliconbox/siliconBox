'use client';

import {
  AI_NOTICE_VERSION,
  API_ROUTES,
  type TailorProposal,
  type Tailoring,
  TailoringSchema,
} from '@siliconbox/shared';
import { useState } from 'react';
import { useApiRequest } from './use-api-request';

/** Asks for proposals that tailor a saved resume to a job, and drops each once handled. */
export function useResumeTailor() {
  const { pending, error, request } = useApiRequest();
  const [tailoring, setTailoring] = useState<Tailoring | null>(null);

  async function suggest(publicId: string, jobDescription: string): Promise<void> {
    const response = await request(API_ROUTES.resumeTailor(publicId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription, consentedNotice: AI_NOTICE_VERSION }),
    });
    if (response !== null) setTailoring(TailoringSchema.parse(await response.json()));
  }

  const handled = (proposal: TailorProposal) =>
    setTailoring((current) =>
      current === null
        ? null
        : { ...current, proposals: current.proposals.filter((p) => p !== proposal) },
    );

  return { pending, error, tailoring, suggest, handled };
}
