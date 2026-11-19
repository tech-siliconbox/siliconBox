import { ScreeningOptionsSchema, screenCv } from '@siliconbox/shared';
import { findResumeOrBlank } from '@/db/resumes';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { extractCvText } from '@/server/cv-text';
import { RATE_LIMITS } from '@/server/rate-limit';
import { renderResumePdf } from '@/server/resume-pdf/render';

/**
 * Screens the saved resume's own PDF the way CV screening reads an upload: the PDF is built,
 * read back as an ATS would read it, and matched against a job description when one is sent.
 * Nothing is stored.
 */
export const POST = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.resumeCheck,
    schemas: { body: ScreeningOptionsSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    const pdf = await renderResumePdf(await findResumeOrBlank(identity));
    const { text, pages } = await extractCvText('resume.pdf', new Uint8Array(pdf));
    return Response.json({
      report: screenCv(text, pages, input.body.jobDescription),
      atsText: text,
    });
  },
);
