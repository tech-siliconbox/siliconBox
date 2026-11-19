'use client';

import {
  API_ROUTES,
  type ResumeCheck,
  ResumeCheckSchema,
  screeningOptions,
} from '@siliconbox/shared';
import { useState } from 'react';
import { useApiRequest } from './use-api-request';

/** Screens a saved resume's PDF on the server, against a job description when one is given. */
export function useResumeCheck() {
  const { pending, error, request } = useApiRequest();
  const [result, setResult] = useState<ResumeCheck | null>(null);

  async function check(publicId: string, jobDescription: string): Promise<void> {
    const response = await request(API_ROUTES.resumeCheck(publicId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(screeningOptions(jobDescription)),
    });
    if (response !== null) setResult(ResumeCheckSchema.parse(await response.json()));
  }

  return { pending, error, result, check };
}
