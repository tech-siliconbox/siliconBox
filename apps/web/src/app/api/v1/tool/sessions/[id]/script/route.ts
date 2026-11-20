import { IdParamsSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { fileDownload } from '@/server/download';
import { sessionScript } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** The commands run in the session, as a Tcl script to download. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) =>
    fileDownload(await sessionScript(identity, input.params.id), 'praman-session', 'tcl'),
);
