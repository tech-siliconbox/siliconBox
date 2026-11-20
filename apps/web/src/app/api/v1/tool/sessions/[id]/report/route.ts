import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { fileDownload } from '@/server/download';
import { sessionReport } from '@/server/praman/results';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The session's last finished proof as an HTML report, only ever as a download. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => {
    const report = await sessionReport(identity, input.params.id);
    return fileDownload(report.html, report.name.replace(/\.html$/i, ''), 'html');
  },
);
