import { resumeFromLinkedIn } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { MAX_LINKEDIN_EXPORT_BYTES, readLinkedInExport } from '@/server/linkedin-export';
import { RATE_LIMITS } from '@/server/rate-limit';
import { addResume, assertRoomForResume } from '@/server/resumes';
import { readUpload } from '@/server/upload';

/**
 * A new resume from the learner's LinkedIn data export (.zip). Only the profile, positions,
 * education, skills and similar CSV files are read; the archive itself is not kept.
 */
export const POST = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.resumeImport, schemas: {} },
  async ({ identity, request }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    await assertRoomForResume(identity.userId);
    const { file } = await readUpload(
      request,
      MAX_LINKEDIN_EXPORT_BYTES,
      'LINKEDIN_EXPORT_NOT_SUPPORTED',
    );
    const files = readLinkedInExport(new Uint8Array(await file.arrayBuffer()));
    const { resume, dropped, notes } = resumeFromLinkedIn(files, identity);
    const saved = await addResume(identity.userId, { title: 'From LinkedIn', resume });
    return Response.json({ saved, dropped, notes }, { status: 201 });
  },
);
