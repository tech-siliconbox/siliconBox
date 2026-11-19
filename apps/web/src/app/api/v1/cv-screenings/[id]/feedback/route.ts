import { CvFeedbackRequestSchema, IdParamsSchema } from '@siliconbox/shared';
import { assertAiConfigured } from '@/server/ai/claude';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { giveCvFeedback } from '@/server/cv-feedback';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Each call to Claude may take 60 s and is retried once; Vercel allows this much (ADR 0030). */
export const maxDuration = 150;

/**
 * AI feedback on one of the learner's saved screenings, once they agreed to the current notice
 * (the body names its version). Uses their allowance; a failure gives it back.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.aiRequest,
    schemas: { params: IdParamsSchema, body: CvFeedbackRequestSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, CAREER_SERVICES.cvScreening);
    assertAiConfigured();
    const feedback = await giveCvFeedback(identity, input.params.id, input.body.jobDescription);
    return Response.json(feedback);
  },
);
