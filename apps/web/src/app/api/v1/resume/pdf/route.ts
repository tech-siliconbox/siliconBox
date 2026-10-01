import { emptyResume } from '@siliconbox/shared';
import { findResume } from '@/db/resumes';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { RATE_LIMITS } from '@/server/rate-limit';
import { renderResumePdf } from '@/server/resume-pdf/render';

/** The saved resume as an ATS-friendly PDF download. */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: {} },
  async ({ identity }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    const resume =
      (await findResume(identity.userId)) ?? emptyResume(identity.name, identity.email);
    const pdf = await renderResumePdf(resume);
    const fileName = `${resume.basics.fullName.replace(/[^A-Za-z0-9]+/g, '-')}-resume.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  },
);
