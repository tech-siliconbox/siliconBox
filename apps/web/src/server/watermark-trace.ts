import 'server-only';
import { type LearnerSummary, findLearnersByIds, findLearnersByVisibleMark } from '@/db/users';
import { findUserIdsByMarkCodes } from '@/db/watermark-codes';
import { findMarks } from './invisible-mark';
import { parseVisibleMarks } from './watermark';

/** One clue found in the leaked text and the learner accounts it points to. */
export type TraceMatch = {
  source: 'invisible' | 'visible';
  clue: string;
  learners: LearnerSummary[];
};

async function traceInvisible(text: string): Promise<TraceMatch[]> {
  const codes = [...new Set(findMarks(text))];
  const owners = await findUserIdsByMarkCodes(codes);
  return Promise.all(
    codes.map(async (code) => ({
      source: 'invisible' as const,
      clue: `hidden code ${code.toString(16).padStart(8, '0')}`,
      learners: await findLearnersByIds(
        owners.filter((owner) => owner.code === code).map((owner) => owner.userId),
      ),
    })),
  );
}

async function traceVisible(text: string): Promise<TraceMatch[]> {
  return Promise.all(
    parseVisibleMarks(text).map(async (mark) => ({
      source: 'visible' as const,
      clue: `${mark.shortId} · ${mark.emailPrefix}…@${mark.domain}`,
      learners: await findLearnersByVisibleMark(mark),
    })),
  );
}

/** Every watermark in leaked text (hidden codes and visible marks) and whose account it is. */
export async function traceLeak(text: string): Promise<TraceMatch[]> {
  const [invisible, visible] = await Promise.all([traceInvisible(text), traceVisible(text)]);
  return [...invisible, ...visible];
}
