import { screenCv } from '@siliconbox/shared';
import { deleteScreenings, listScreenings, saveScreening } from '@/db/cv-screenings';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { MAX_CV_BYTES, extractCvText } from '@/server/cv-text';
import { RATE_LIMITS } from '@/server/rate-limit';
import { readUpload } from '@/server/upload';

const SCREENING = CAREER_SERVICES.cvScreening;

/**
 * Screens an uploaded CV (PDF or .docx). The file is read in memory and discarded; only the
 * report is kept, under the learner's account, until they delete it.
 */
export const POST = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.cvScreen, schemas: {} },
  async ({ identity, request }) => {
    await assertCareerTool(identity, SCREENING);
    const file = await readUpload(request, MAX_CV_BYTES, 'FILE_NOT_SUPPORTED');
    const { text, pages } = await extractCvText(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );
    const screening = await saveScreening(
      identity.userId,
      file.name.slice(0, 120),
      screenCv(text, pages),
    );
    return Response.json(screening, { status: 201 });
  },
);

export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async ({ identity }) => {
    await assertCareerTool(identity, SCREENING);
    return Response.json({ screenings: await listScreenings(identity.userId) });
  },
);

/** Deletes every saved screening report (personal data, DPDP). */
export const DELETE = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: {} },
  async ({ identity }) => Response.json({ deleted: await deleteScreenings(identity.userId) }),
);
