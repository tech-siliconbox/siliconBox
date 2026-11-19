import 'server-only';
import { CV_FEEDBACK_LIMITS as L } from '@siliconbox/shared';
import { DATA_RULE, PLAIN_TEXT_RULE, REDACTION_RULE, dataBlock } from './prompt-parts';

// The instructions and the message for AI feedback on a CV (ADR 0030). The learner's text goes in
// marked blocks and is data, never instructions; the answer is checked again on the server.

export const CV_FEEDBACK_SYSTEM = `You review CVs for people applying to formal verification and hardware verification roles, most of them students and early-career engineers in India. A rule-based checker has already scored the CV for format, sections, length and keywords, and its findings are given to you. Your part is what rules cannot judge: the writing, and how the CV fits a job description when one is given.

Return:
- summary: two or three sentences on how the CV reads to a hiring engineer.
- suggestions: at most ${L.suggestions}, most important first. Each names one concrete weakness, in one passage (its id, such as "P3") or in the CV as a whole (passageId null). Where it helps, give a rewrite of that passage: the same facts, stated more strongly, standing on its own. impact is high, medium or low.
- strengths: at most ${L.strengths} real strengths. Do not invent strengths.
- jobFit: null when no job description is given. Otherwise: verdict, how the candidate's actual experience lines up with what the role asks for, as a judgement rather than a keyword count; gaps, at most ${L.gaps} things the job description asks for that the CV does not show, each named in the posting's own words with advice; strengths, where the CV clearly meets the role.

Rules:
- Never give a score, rating, grade or percentage.
- Never invent facts: no employers, dates, titles, tools, results or numbers that are not in the CV. If a passage would be stronger with a number, say so in the issue and do not supply one. A rewrite may use only numbers that appear in its passage.
- Do not comment on file format, fonts, layout, length or which sections are present. The checker covers those; its findings are context, so do not repeat them.
- ${REDACTION_RULE}
- ${PLAIN_TEXT_RULE}
- Limits: summary and verdict ${L.summary} characters; each issue, rewrite, strength and advice ${L.point}; each gap's need ${L.need}.
- ${DATA_RULE}`;

export type CvFeedbackInput = {
  findings: string[];
  passages: ReadonlyMap<string, string>;
  redactedText: string;
  jobDescription?: string | undefined;
};

/** The user message: the checker's findings, the posting, the numbered passages and the CV text. */
export function cvFeedbackContent(input: CvFeedbackInput): string {
  const findings =
    input.findings.length === 0 ? ['none'] : input.findings.map((line) => `- ${line}`);
  const passages = [...input.passages].map(([id, text]) => `${id}: ${text}`);
  return [
    `<checker_findings>\n${findings.join('\n')}\n</checker_findings>`,
    dataBlock('job_description', input.jobDescription ?? 'none given'),
    dataBlock('cv_passages', passages.length === 0 ? 'none' : passages.join('\n')),
    dataBlock('cv_text', input.redactedText),
  ].join('\n');
}
