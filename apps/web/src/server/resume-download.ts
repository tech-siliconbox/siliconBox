import 'server-only';
import { IdParamsSchema, type Resume } from '@siliconbox/shared';
import { withApiGate } from './api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from './career-services';
import { fileDownload } from './download';
import { RATE_LIMITS } from './rate-limit';
import { ownResume } from './resumes';

/** A gated route that sends one of the learner's saved resumes as a PDF or Word download. */
export function resumeDownloadRoute(
  kind: 'pdf' | 'docx',
  render: (resume: Resume) => Promise<Buffer>,
) {
  return withApiGate(
    {
      access: { kind: 'signedIn' },
      rateLimit: RATE_LIMITS.write,
      schemas: { params: IdParamsSchema },
    },
    async ({ identity, input }) => {
      await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
      const { resume } = await ownResume(identity.userId, input.params.id);
      return fileDownload(await render(resume), `${resume.basics.fullName}-resume`, kind);
    },
  );
}
