import { IdParamsSchema, ResumeDocumentInputSchema } from '@siliconbox/shared';
import { deleteResume, saveResume } from '@/db/resumes';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { AppError } from '@/server/errors';
import { RATE_LIMITS } from '@/server/rate-limit';
import { ownResume } from '@/server/resumes';

const RESUME_BUILDER = CAREER_SERVICES.resumeBuilder;

/** One of the learner's resumes with its content. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, RESUME_BUILDER);
    return Response.json(await ownResume(identity.userId, input.params.id));
  },
);

/** Saves a resume's name and content (the builder autosaves); answers with its summary. */
export const PUT = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: IdParamsSchema, body: ResumeDocumentInputSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, RESUME_BUILDER);
    const saved = await saveResume(identity.userId, input.params.id, input.body);
    if (saved === null) throw new AppError('NOT_FOUND', `resume ${input.params.id}`);
    return Response.json(saved);
  },
);

/** Deletes a resume (personal data, DPDP); allowed even when the service is locked. */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    if (!(await deleteResume(identity.userId, input.params.id))) {
      throw new AppError('NOT_FOUND', `resume ${input.params.id}`);
    }
    return new Response(null, { status: 204 });
  },
);
