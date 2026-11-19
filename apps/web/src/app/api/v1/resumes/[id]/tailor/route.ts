import { IdParamsSchema, TailorRequestSchema } from '@siliconbox/shared';
import { assertAiConfigured } from '@/server/ai/claude';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { RATE_LIMITS } from '@/server/rate-limit';
import { tailorResume } from '@/server/resume-ai';
import { ownResume } from '@/server/resumes';

/** Each call to Claude may take 60 s and is retried once; Vercel allows this much (ADR 0030). */
export const maxDuration = 150;

/**
 * AI proposals that tailor a saved resume to a job, once the learner agreed to the current
 * notice. Nothing is saved: the learner accepts proposals in the builder, which then saves.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.aiRequest,
    schemas: { params: IdParamsSchema, body: TailorRequestSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    assertAiConfigured();
    const { resume } = await ownResume(identity.userId, input.params.id);
    return Response.json(await tailorResume(identity, resume, input.body.jobDescription));
  },
);
