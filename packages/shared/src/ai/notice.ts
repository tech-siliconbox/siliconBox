// What a learner agrees to before their text goes to the AI provider (ADR 0030), and how much AI
// feedback each learner may ask for. One source for the page, the API and the privacy notice.

/** Changes whenever the notice below changes; each consent names the version the learner saw. */
export const AI_NOTICE_VERSION = '2026-11-19';

export const AI_NOTICE = [
  'We send the text of this CV to Anthropic, the maker of Claude, with your name, contact details, links and personal details removed, and the job description if you pasted one.',
  'Anthropic processes it in the United States and deletes it within 30 days, or keeps it up to 2 years only if it is flagged for misuse. It does not use it to train its models.',
  'The feedback is saved with this report until you delete it.',
] as const;

/** AI feedback a learner may ask for, across every tool that offers it. */
export const AI_FEEDBACK_LIMITS = { perDay: 5, perMonth: 30 } as const;
