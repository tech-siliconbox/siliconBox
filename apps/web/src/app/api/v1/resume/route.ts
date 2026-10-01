import { ResumeSchema, emptyResume } from '@siliconbox/shared';
import { deleteResume, findResume, saveResume } from '@/db/resumes';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { RATE_LIMITS } from '@/server/rate-limit';

const RESUME = CAREER_SERVICES.resumeBuilder;

/** The learner's own resume (a blank one from the account until they save). */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async ({ identity }) => {
    await assertCareerTool(identity, RESUME);
    const resume =
      (await findResume(identity.userId)) ?? emptyResume(identity.name, identity.email);
    return Response.json(resume);
  },
);

export const PUT = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: { body: ResumeSchema } },
  async ({ identity, input }) => {
    await assertCareerTool(identity, RESUME);
    await saveResume(identity.userId, input.body);
    return new Response(null, { status: 204 });
  },
);

/** Deletes the saved resume (personal data, DPDP). Allowed even when the service is locked. */
export const DELETE = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: {} },
  async ({ identity }) => {
    await deleteResume(identity.userId);
    return new Response(null, { status: 204 });
  },
);
