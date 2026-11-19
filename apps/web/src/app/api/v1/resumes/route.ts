import { ResumeDocumentInputSchema } from '@siliconbox/shared';
import { listResumes } from '@/db/resumes';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { RATE_LIMITS } from '@/server/rate-limit';
import { addResume } from '@/server/resumes';

const RESUME_BUILDER = CAREER_SERVICES.resumeBuilder;

/** The learner's resumes, most recently edited first, without their content. */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async ({ identity }) => {
    await assertCareerTool(identity, RESUME_BUILDER);
    return Response.json({ resumes: await listResumes(identity.userId) });
  },
);

/** Adds a resume (blank, a copy, or imported in the browser) while the learner has room. */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { body: ResumeDocumentInputSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, RESUME_BUILDER);
    return Response.json(await addResume(identity.userId, input.body), { status: 201 });
  },
);
