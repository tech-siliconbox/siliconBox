import { activityDay } from '@siliconbox/shared';
import { appendAudit } from '@/db/audit-log';
import { withApiGate } from '@/server/api/with-api-gate';
import { buildDataExport } from '@/server/data-export';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Everything we hold about the signed-in learner, as a JSON file to keep (DPDP). */
export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.dataExport, schemas: {} },
  async ({ identity, request }) => {
    const now = new Date();
    const data = await buildDataExport(identity, request.headers, now);
    await appendAudit({
      action: 'data_export',
      actorId: identity.userId,
      subjectId: identity.userId,
      createdAt: now,
    });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="siliconbox-data-${activityDay(now)}.json"`,
      },
    });
  },
);
