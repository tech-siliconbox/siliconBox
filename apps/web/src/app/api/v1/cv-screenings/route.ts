import { ScreeningOptionsSchema, screenCv } from '@siliconbox/shared';
import { deleteScreenings, listScreenings, saveScreening } from '@/db/cv-screenings';
import { parseWith } from '@/server/api/input';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { MAX_CV_BYTES, extractCvText } from '@/server/cv-text';
import { RATE_LIMITS } from '@/server/rate-limit';
import { readUpload } from '@/server/upload';

const SCREENING = CAREER_SERVICES.cvScreening;

/**
 * Screens an uploaded CV (PDF or .docx), against a pasted job description when one is sent.
 * The report and the file are kept under the learner's account (the newest files only) until
 * they delete them; the job description is not kept. The text read from the file comes back
 * once so the learner can see what an ATS reads.
 */
export const POST = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.cvScreen, schemas: {} },
  async ({ identity, request }) => {
    await assertCareerTool(identity, SCREENING);
    const { file, fields } = await readUpload(request, MAX_CV_BYTES, 'FILE_NOT_SUPPORTED');
    const { jobDescription } = parseWith(ScreeningOptionsSchema, fields);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { text, pages, kind } = await extractCvText(file.name, bytes);
    const screening = await saveScreening(
      identity.userId,
      { fileName: file.name.slice(0, 120), kind, bytes },
      screenCv(text, pages, jobDescription),
    );
    return Response.json({ screening, atsText: text }, { status: 201 });
  },
);

export const GET = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.read, schemas: {} },
  async ({ identity }) => {
    await assertCareerTool(identity, SCREENING);
    return Response.json({ screenings: await listScreenings(identity.userId) });
  },
);

/** Deletes every saved screening with its file (personal data, DPDP). */
export const DELETE = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: {} },
  async ({ identity }) => Response.json({ deleted: await deleteScreenings(identity.userId) }),
);
