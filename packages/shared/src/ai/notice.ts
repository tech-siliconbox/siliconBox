import { z } from 'zod';

// What a learner agrees to before their text goes to the AI provider (ADR 0030), and how much AI
// help each learner may ask for. One source for the pages, the API and the privacy notice.

/** Changes whenever a notice below changes; each consent names the version the learner saw. */
export const AI_NOTICE_VERSION = '2026-11-19';

const PROVIDER_TERMS =
  'Anthropic processes it in the United States and deletes it within 30 days, or keeps it up to 2 years only if it is flagged for misuse. It does not use it to train its models.';

/** The notice for each AI feature, shown beside the agreement box. */
export const AI_NOTICES = {
  cvFeedback: [
    'We send the text of this CV to Anthropic, the maker of Claude, with your name, contact details, links and personal details removed, and the job description if you pasted one.',
    PROVIDER_TERMS,
    'The feedback is saved with this report until you delete it.',
  ],
  resumeTailor: [
    "We send this resume's sections, without your name and contact details, and the job description to Anthropic, the maker of Claude.",
    PROVIDER_TERMS,
    'Nothing in your resume changes until you accept a suggestion, and the suggestions are not saved.',
  ],
  resumeImport: [
    'We send the text of the CV you upload to Anthropic, the maker of Claude, with your name, contact details, links and personal details removed; we read those from the file ourselves.',
    PROVIDER_TERMS,
    'The file is not kept; the new resume is saved under your account.',
  ],
} as const;
export type AiFeature = keyof typeof AI_NOTICES;

/** AI help a learner may ask for, across every AI feature. */
export const AI_ALLOWANCE = { perDay: 5, perMonth: 30 } as const;

/** A request's agreement: the version of the notice the learner saw and accepted. */
export const AiConsentSchema = z.strictObject({ consentedNotice: z.literal(AI_NOTICE_VERSION) });
