import { screenCv } from '@siliconbox/shared';
import { deleteScreenings, listScreenings, saveScreening } from '@/db/cv-screenings';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { MAX_CV_BYTES, extractCvText } from '@/server/cv-text';
import { AppError } from '@/server/errors';
import { RATE_LIMITS } from '@/server/rate-limit';

const SCREENING = CAREER_SERVICES.cvScreening;
// Multipart framing adds a little to the file itself.
const MAX_REQUEST_BYTES = MAX_CV_BYTES + 64 * 1024;

/** The uploaded file from a multipart body, size-checked before it is read. */
async function readUpload(request: Request): Promise<File> {
  if (Number(request.headers.get('content-length') ?? MAX_REQUEST_BYTES + 1) > MAX_REQUEST_BYTES) {
    throw new AppError('FILE_NOT_SUPPORTED', 'request too large');
  }
  const file = (await request.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) throw new AppError('FILE_NOT_SUPPORTED', 'no file field');
  return file;
}

/**
 * Screens an uploaded CV (PDF or .docx). The file is read in memory and discarded; only the
 * report is kept, under the learner's account, until they delete it.
 */
export const POST = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.cvScreen, schemas: {} },
  async ({ identity, request }) => {
    await assertCareerTool(identity, SCREENING);
    const file = await readUpload(request);
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
