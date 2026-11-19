import { findResumeOrBlank } from '@/db/resumes';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { fileDownload } from '@/server/download';
import { RATE_LIMITS } from '@/server/rate-limit';
import { renderResumePdf } from '@/server/resume-pdf/render';

/** The saved resume as an ATS-friendly PDF download. */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: {} },
  async ({ identity }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    const resume = await findResumeOrBlank(identity);
    const pdf = await renderResumePdf(resume);
    return fileDownload(pdf, `${resume.basics.fullName}-resume`, 'pdf');
  },
);
