import { z } from 'zod';
import { addsNumbers, clip, hasPersonalData, inPosting } from '../ai/checks';

// AI feedback on a CV (ADR 0030): the answer the model must give, the checks it must pass, and
// the feedback we keep. The model never scores; the rule-based report holds the only number.

const IMPACTS = ['high', 'medium', 'low'] as const;

/** Most the model may write; it is told these, and longer text is cut, longer lists trimmed. */
export const CV_FEEDBACK_LIMITS = {
  summary: 800,
  point: 400,
  need: 120,
  suggestions: 8,
  strengths: 5,
  gaps: 8,
} as const;

/** The answer's shape as the model must give it; the limits are applied after, not here. */
export const CvFeedbackAnswerSchema = z.strictObject({
  summary: z.string(),
  suggestions: z.array(
    z.strictObject({
      passageId: z.string().nullable(),
      issue: z.string(),
      rewrite: z.string().nullable(),
      impact: z.enum(IMPACTS),
    }),
  ),
  strengths: z.array(z.string()),
  jobFit: z
    .strictObject({
      verdict: z.string(),
      gaps: z.array(z.strictObject({ need: z.string(), advice: z.string() })),
      strengths: z.array(z.string()),
    })
    .nullable(),
});
export type CvFeedbackAnswer = z.infer<typeof CvFeedbackAnswerSchema>;

const text = (max: number) => z.string().min(1).max(max);
const L = CV_FEEDBACK_LIMITS;

/** Feedback as kept and shown: within the limits, each rewrite beside the passage it rewrites. */
export const CvFeedbackSchema = z.object({
  summary: text(L.summary),
  suggestions: z
    .array(
      z.object({
        passage: z.string().nullable(),
        issue: text(L.point),
        rewrite: text(L.point).nullable(),
        impact: z.enum(IMPACTS),
      }),
    )
    .max(L.suggestions),
  strengths: z.array(text(L.point)).max(L.strengths),
  jobFit: z
    .object({
      verdict: text(L.summary),
      gaps: z.array(z.object({ need: text(L.need), advice: text(L.point) })).max(L.gaps),
      strengths: z.array(text(L.point)).max(L.strengths),
    })
    .nullable(),
});
export type CvFeedback = z.infer<typeof CvFeedbackSchema>;

/** One AI review kept with its screening, with the model and the notice the learner agreed to. */
export const StoredCvFeedbackSchema = z.object({
  createdAt: z.coerce.date(),
  model: z.string(),
  noticeVersion: z.string(),
  review: CvFeedbackSchema,
});
export type StoredCvFeedback = z.infer<typeof StoredCvFeedbackSchema>;

/** What the answer is checked against: the passages we sent, by id, and the job description. */
export type FeedbackContext = {
  passages: ReadonlyMap<string, string>;
  jobDescription?: string | undefined;
};

export type FittedFeedback = { ok: true; feedback: CvFeedback } | { ok: false; reason: string };

const points = (items: string[], max: number) =>
  items
    .filter((item) => item.trim() !== '' && !hasPersonalData(item))
    .slice(0, max)
    .map((item) => clip(item, L.point));

function fitSuggestions(answer: CvFeedbackAnswer, { passages }: FeedbackContext) {
  const kept = answer.suggestions.flatMap((suggestion) => {
    const passage = suggestion.passageId === null ? null : passages.get(suggestion.passageId);
    const { issue, rewrite } = suggestion;
    const rejected =
      passage === undefined ||
      issue.trim() === '' ||
      hasPersonalData(issue) ||
      (rewrite !== null &&
        (passage === null || hasPersonalData(rewrite) || addsNumbers(rewrite, passage)));
    if (rejected) return [];
    const fitted = { passage, issue: clip(issue, L.point), impact: suggestion.impact };
    return [{ ...fitted, rewrite: rewrite === null ? null : clip(rewrite, L.point) }];
  });
  return { kept: kept.slice(0, L.suggestions), dropped: answer.suggestions.length - kept.length };
}

function fitJobFit(answer: CvFeedbackAnswer, posting: string | undefined): CvFeedback['jobFit'] {
  if (posting === undefined || answer.jobFit === null) return null;
  const { verdict, gaps, strengths } = answer.jobFit;
  return {
    verdict: clip(verdict, L.summary),
    gaps: gaps
      .filter(({ need, advice }) => inPosting(need, posting) && !hasPersonalData(need + advice))
      .slice(0, L.gaps)
      .map(({ need, advice }) => ({ need: clip(need, L.need), advice: clip(advice, L.point) })),
    strengths: points(strengths, L.strengths),
  };
}

/**
 * Checks the model's answer before anything is kept or shown, and fits it to the limits. Items
 * that fail are dropped; the whole answer is refused when its summary or verdict fails, or when
 * more suggestions fail than pass, since the rest of it cannot then be trusted either.
 */
export function fitCvFeedback(answer: CvFeedbackAnswer, context: FeedbackContext): FittedFeedback {
  if (hasPersonalData(answer.summary) || hasPersonalData(answer.jobFit?.verdict ?? '')) {
    return { ok: false, reason: 'personal data in the summary or verdict' };
  }
  const { kept, dropped } = fitSuggestions(answer, context);
  if (dropped > kept.length) return { ok: false, reason: `${dropped} suggestions failed checks` };
  const parsed = CvFeedbackSchema.safeParse({
    summary: clip(answer.summary, L.summary),
    suggestions: kept,
    strengths: points(answer.strengths, L.strengths),
    jobFit: fitJobFit(answer, context.jobDescription),
  });
  return parsed.success
    ? { ok: true, feedback: parsed.data }
    : { ok: false, reason: 'answer outside the stored shape' };
}
