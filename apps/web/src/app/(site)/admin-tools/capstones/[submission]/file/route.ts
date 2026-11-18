import { PublicIdSchema } from '@siliconbox/shared';
import { findSubmissionFile, findSubmissionForReview } from '@/db/capstone-submissions';
import { expertSession } from '@/server/capstone-reviews';

const NOT_FOUND = () => new Response('Not found', { status: 404 });

/** The uploaded .zip, for an expert grading it. Anyone else gets "not found". */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submission: string }> },
): Promise<Response> {
  if ((await expertSession()) === null) return NOT_FOUND();
  const id = PublicIdSchema.safeParse((await params).submission);
  const submission = id.success ? await findSubmissionForReview(id.data) : null;
  const file = submission && (await findSubmissionFile(submission.publicId));
  if (!submission || !file) return NOT_FOUND();
  const name = submission.fileName.replace(/[^\w.-]+/g, '_');
  return new Response(file, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'private, no-store',
    },
  });
}
