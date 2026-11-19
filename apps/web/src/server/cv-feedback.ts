import 'server-only';
import {
  AI_NOTICE_VERSION,
  type CvFeedback,
  CvFeedbackAnswerSchema,
  type CvReport,
  type StoredCvFeedback,
  cvPassages,
  fitCvFeedback,
  redactCv,
} from '@siliconbox/shared';
import { findScreeningFile, saveFeedback } from '@/db/cv-screenings';
import { AI_MODEL, type AskClaude, askClaude } from './ai/claude';
import { CV_FEEDBACK_SYSTEM, cvFeedbackContent } from './ai/cv-feedback-prompt';
import { type AiTaskDeps, LIVE_TASK_DEPS, runAiTask } from './ai/task';
import type { Identity } from './auth/authenticate';
import { extractCvText } from './cv-text';
import { AppError } from './errors';

// AI feedback on a saved screening's CV (ADR 0030): the learner's allowance is used, the text
// goes out without their name and contact details, and the answer is checked before it is kept.

type ReviewInput = {
  text: string;
  learnerName: string;
  report: CvReport;
  jobDescription?: string | undefined;
};

/** The rule-based findings the model is given as context, so it does not contradict them. */
const findingsOf = (report: CvReport) =>
  report.checks
    .filter((check) => check.status !== 'pass')
    .map((check) => `${check.status}: ${check.title}`);

/** Redacts the CV, asks Claude, and keeps only what passes the checks. */
export async function reviewCvText(input: ReviewInput, ask: AskClaude): Promise<CvFeedback> {
  const redactedText = redactCv(input.text, input.learnerName);
  const passages = cvPassages(redactedText);
  const { jobDescription } = input;
  const answer = await ask({
    system: CV_FEEDBACK_SYSTEM,
    content: cvFeedbackContent({
      findings: findingsOf(input.report),
      passages,
      redactedText,
      jobDescription,
    }),
    schema: CvFeedbackAnswerSchema,
  });
  const fitted = fitCvFeedback(answer, { passages, jobDescription });
  if (!fitted.ok) throw new AppError('AI_UNAVAILABLE', `answer refused: ${fitted.reason}`);
  return fitted.feedback;
}

/** What giving feedback depends on; tests replace each part. */
export type FeedbackDeps = AiTaskDeps & {
  findCvText: (userId: string, screeningId: string) => Promise<{ report: CvReport; text: string }>;
  saveFeedback: (userId: string, screeningId: string, feedback: StoredCvFeedback) => Promise<void>;
  ask: AskClaude;
};

/** The learner's screening and its CV's text; not found, or the file no longer kept, refuse. */
async function findCvText(userId: string, screeningId: string) {
  const found = await findScreeningFile(userId, screeningId);
  if (found === null) throw new AppError('NOT_FOUND', `screening ${screeningId}`);
  if (found.file === null) throw new AppError('CV_FILE_NOT_KEPT', `screening ${screeningId}`);
  const { text } = await extractCvText(found.file.fileName, found.file.bytes);
  return { report: found.report, text };
}

const LIVE: FeedbackDeps = { ...LIVE_TASK_DEPS, findCvText, saveFeedback, ask: askClaude };

/** Gives AI feedback on one of the learner's saved screenings and keeps it with the report. */
export async function giveCvFeedback(
  identity: Identity,
  screeningId: string,
  jobDescription: string | undefined,
  deps: FeedbackDeps = LIVE,
): Promise<StoredCvFeedback> {
  const { report, text } = await deps.findCvText(identity.userId, screeningId);
  return runAiTask(identity.userId, 'cvFeedback', deps, async () => {
    const review = await reviewCvText(
      { text, learnerName: identity.name, report, jobDescription },
      deps.ask,
    );
    const feedback = {
      createdAt: new Date(),
      model: AI_MODEL,
      noticeVersion: AI_NOTICE_VERSION,
      review,
    };
    await deps.saveFeedback(identity.userId, screeningId, feedback);
    return feedback;
  });
}
