import { IdParamsSchema } from '@siliconbox/shared';
import { findScreeningFile } from '@/db/cv-screenings';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { fileDownload } from '@/server/download';
import { AppError } from '@/server/errors';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The learner's own CV file for one screening, while it is kept; another learner's is not found. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.write,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    await assertCareerTool(identity, CAREER_SERVICES.cvScreening);
    const found = await findScreeningFile(identity.userId, input.params.id);
    if (found === null) throw new AppError('NOT_FOUND', `screening ${input.params.id}`);
    if (found.file === null) throw new AppError('CV_FILE_NOT_KEPT', `screening ${input.params.id}`);
    const { fileName, kind, bytes } = found.file;
    return fileDownload(bytes, fileName.replace(/\.(pdf|docx)$/i, ''), kind);
  },
);
