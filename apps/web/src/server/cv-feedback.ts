import 'server-only';
import {
  AI_NOTICE_VERSION,
  type AuditEntry,
  type CvFeedback,
  CvFeedbackAnswerSchema,
  type CvReport,
  type StoredCvFeedback,
  cvPassages,
  fitCvFeedback,
  redactCv,
} from '@siliconbox/shared';
import { appendAudit } from '@/db/audit-log';
import { findScreeningFile, saveFeedback } from '@/db/cv-screenings';
import { refundAiAllowance, spendAiAllowance } from './ai/allowance';
import { AI_MODEL, type AskClaude, askClaude } from './ai/claude';
import { CV_FEEDBACK_SYSTEM, cvFeedbackContent } from './ai/cv-feedback-prompt';
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
export type FeedbackDeps = {
  findCvText: (userId: string, screeningId: string) => Promise<{ report: CvReport; text: string }>;
  saveFeedback: (userId: string, screeningId: string, feedback: StoredCvFeedback) => Promise<void>;
  ask: AskClaude;
  spend: (userId: string) => Promise<void>;
  refund: (userId: string) => Promise<void>;
  audit: (entry: AuditEntry) => Promise<void>;
};

/** The learner's screening and its CV's text; not found, or the file no longer kept, refuse. */
async function findCvText(userId: string, screeningId: string) {
  const found = await findScreeningFile(userId, screeningId);
  if (found === null) throw new AppError('NOT_FOUND', `screening ${screeningId}`);
  if (found.file === null) throw new AppError('CV_FILE_NOT_KEPT', `screening ${screeningId}`);
  const { text } = await extractCvText(found.file.fileName, found.file.bytes);
  return { report: found.report, text };
}

const LIVE: FeedbackDeps = {
  findCvText,
  saveFeedback,
  ask: askClaude,
  spend: spendAiAllowance,
  refund: refundAiAllowance,
  audit: appendAudit,
};

/**
 * Gives AI feedback on one of the learner's saved screenings and keeps it with the report. A
 * failure gives the allowance back. Each use is audit-logged with the notice agreed to, no text.
 */
export async function giveCvFeedback(
  identity: Identity,
  screeningId: string,
  jobDescription: string | undefined,
  deps: FeedbackDeps = LIVE,
): Promise<StoredCvFeedback> {
  const { report, text } = await deps.findCvText(identity.userId, screeningId);
  await deps.spend(identity.userId);
  const audit = (outcome: 'given' | 'failed') =>
    deps.audit({
      action: 'ai_feedback',
      actorId: identity.userId,
      subjectId: identity.userId,
      metadata: { screening: screeningId, outcome, model: AI_MODEL, notice: AI_NOTICE_VERSION },
      createdAt: new Date(),
    });
  try {
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
    await audit('given');
    return feedback;
  } catch (error) {
    await deps.refund(identity.userId);
    await audit('failed');
    throw error;
  }
}
