import 'server-only';
import {
  ImportAnswerSchema,
  type Resume,
  TailorAnswerSchema,
  type Tailoring,
  contactFromCv,
  fitImport,
  fitTailoring,
  redactCv,
} from '@siliconbox/shared';
import { type AskClaude, askClaude } from './ai/claude';
import {
  IMPORT_SYSTEM,
  TAILOR_SYSTEM,
  importContent,
  resumeForTailoring,
  tailorContent,
} from './ai/resume-prompts';
import { type AiTaskDeps, LIVE_TASK_DEPS, runAiTask } from './ai/task';
import type { Identity } from './auth/authenticate';
import { AppError } from './errors';

// The Resume Builder's AI help (ADR 0030), on the learner's AI allowance. Neither keeps anything
// itself: tailoring returns proposals the learner accepts one by one, and an import returns a
// resume the route saves.

export type ResumeAiDeps = AiTaskDeps & { ask: AskClaude };
const LIVE: ResumeAiDeps = { ...LIVE_TASK_DEPS, ask: askClaude };

/** Proposals that tailor the resume to a job, checked against the resume and the posting. */
export function tailorResume(
  identity: Identity,
  resume: Resume,
  jobDescription: string,
  deps: ResumeAiDeps = LIVE,
): Promise<Tailoring> {
  return runAiTask(identity.userId, 'resumeTailor', deps, async () => {
    const redacted = redactCv(resumeForTailoring(resume), identity.name);
    const answer = await deps.ask({
      system: TAILOR_SYSTEM,
      content: tailorContent(redacted, jobDescription),
      schema: TailorAnswerSchema,
    });
    const fitted = fitTailoring(answer, { resume, jobDescription });
    if (!fitted.ok) throw new AppError('AI_UNAVAILABLE', `tailoring refused: ${fitted.reason}`);
    return fitted.tailoring;
  });
}

/**
 * A resume read from a CV's text: contact details from the text itself, the rest from the
 * model's reading of the redacted text, keeping only what the CV says.
 */
export function importCvWithAi(
  identity: Identity,
  text: string,
  deps: ResumeAiDeps = LIVE,
): Promise<{ resume: Resume; dropped: number }> {
  return runAiTask(identity.userId, 'resumeImport', deps, async () => {
    const redacted = redactCv(text, identity.name);
    const answer = await deps.ask({
      system: IMPORT_SYSTEM,
      content: importContent(redacted),
      schema: ImportAnswerSchema,
    });
    const basics = contactFromCv(text, { name: identity.name, email: identity.email });
    return fitImport(answer, { sourceText: redacted, basics });
  });
}
