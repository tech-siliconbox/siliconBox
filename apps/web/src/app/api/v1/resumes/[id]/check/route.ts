import { IdParamsSchema, ScreeningOptionsSchema, screenCv } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { extractCvText } from '@/server/cv-text';
import { RATE_LIMITS } from '@/server/rate-limit';
import { renderResumePdf } from '@/server/resume-pdf/render';
import { ownResume } from '@/server/resumes';

/**
 * Screens a saved resume's own PDF the way CV screening reads an upload: the PDF is built, read
 * back as an ATS would read it, and matched against a job description when one is sent. Nothing
 * is stored.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.resumeCheck,
    schemas: { params: IdParamsSchema, body: ScreeningOptionsSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    const { resume } = await ownResume(identity.userId, input.params.id);
    const pdf = await renderResumePdf(resume);
    const { text, pages } = await extractCvText('resume.pdf', new Uint8Array(pdf));
    return Response.json({
      report: screenCv(text, pages, input.body.jobDescription),
      atsText: text,
    });
  },
);
