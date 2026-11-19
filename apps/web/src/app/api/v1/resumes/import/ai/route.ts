import { AiConsentSchema } from '@siliconbox/shared';
import { assertAiConfigured } from '@/server/ai/claude';
import { parseWith } from '@/server/api/input';
import { withApiGate } from '@/server/api/with-api-gate';
import { CAREER_SERVICES, assertCareerTool } from '@/server/career-services';
import { MAX_CV_BYTES, extractCvText } from '@/server/cv-text';
import { RATE_LIMITS } from '@/server/rate-limit';
import { importCvWithAi } from '@/server/resume-ai';
import { addResume, assertRoomForResume } from '@/server/resumes';
import { readUpload } from '@/server/upload';

/** Each call to Claude may take 60 s and is retried once; Vercel allows this much (ADR 0030). */
export const maxDuration = 150;

/**
 * A new resume read from an uploaded CV (PDF or .docx) with AI, once the learner agreed to the
 * current notice (a form field names its version). The file is read in memory and not kept.
 */
export const POST = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.aiRequest, schemas: {} },
  async ({ identity, request }) => {
    await assertCareerTool(identity, CAREER_SERVICES.resumeBuilder);
    assertAiConfigured();
    await assertRoomForResume(identity.userId);
    const { file, fields } = await readUpload(request, MAX_CV_BYTES, 'FILE_NOT_SUPPORTED');
    parseWith(AiConsentSchema, fields);
    const { text } = await extractCvText(file.name, new Uint8Array(await file.arrayBuffer()));
    const { resume, dropped } = await importCvWithAi(identity, text);
    const saved = await addResume(identity.userId, { title: 'Imported CV', resume });
    return Response.json({ saved, dropped }, { status: 201 });
  },
);
