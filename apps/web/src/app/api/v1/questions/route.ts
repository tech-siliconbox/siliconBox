import { QuestionQuerySchema } from '@siliconbox/shared';
import { findPublishedQuestions } from '@/db/questions';
import { withApiGate } from '@/server/api/with-api-gate';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The public question bank: question text and company tags only, never answers. */
export const GET = withApiGate(
  {
    access: { kind: 'public' },
    rateLimit: RATE_LIMITS.read,
    schemas: { query: QuestionQuerySchema },
  },
  async ({ input }) => Response.json(await findPublishedQuestions(input.query)),
);
