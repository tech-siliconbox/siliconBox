import { FORMAL_VERIFICATION_KEYWORDS, HARDWARE_KEYWORDS, type KeywordGroup } from './keywords';
import { BULLET, nonEmptyLines } from './lines';
import type { JobMatch } from './report';

// Matches a CV against a pasted job description on the terms we know: formal verification and
// wider hardware work. A fixed list keeps the result explainable and never asks for the
// employer's name, a city or a perk. Weighting requirements up and skipping the offer part
// follows the approach of Reactive Resume's matcher (MIT licence).

type Term = KeywordGroup['keywords'][number];
type Section = 'other' | 'requirements' | 'offer';

const TERMS: Term[] = [...FORMAL_VERIFICATION_KEYWORDS, ...HARDWARE_KEYWORDS].flatMap(
  (group) => group.keywords,
);

/** A term asked for under a requirements heading counts for more than one in the company blurb. */
const REQUIREMENT_WEIGHT = 1.5;
const MAX_HEADING_WORDS = 6;

/** Headings that start a part of a posting, checked in this order. */
const HEADINGS: [Section, RegExp][] = [
  [
    'offer',
    /\b(benefits|perks|what we offer|compensation|salary|why (join|work)|our offer|what you(['’]ll| will) get)\b/i,
  ],
  [
    'requirements',
    /\b(requirements?|qualifications?|skills|must[- ]haves?|nice[- ]to[- ]haves?|you(['’]ll| will) (need|bring)|looking for|about you|who you are|your profile|eligibility)\b/i,
  ],
  [
    'other',
    /\b(about (us|the (company|team|role|job))|the role|overview|responsibilities|what you(['’]ll| will) do|job description|who we are)\b/i,
  ],
];

/** The part a heading-shaped line starts, or null for an ordinary line. */
function sectionStartedBy(line: string): Section | null {
  const headingShaped =
    !BULLET.test(line) && !/[.!?]$/.test(line) && line.split(/\s+/).length <= MAX_HEADING_WORDS;
  if (!headingShaped) return null;
  return HEADINGS.find(([, pattern]) => pattern.test(line))?.[0] ?? null;
}

/** Each term the posting asks for outside its offer part, with its weight. */
function askedTerms(jobDescription: string): Map<Term, number> {
  const asked = new Map<Term, number>();
  let section: Section = 'other';
  for (const line of nonEmptyLines(jobDescription)) {
    section = sectionStartedBy(line) ?? section;
    if (section === 'offer') continue;
    const weight = section === 'requirements' ? REQUIREMENT_WEIGHT : 1;
    for (const term of TERMS.filter((t) => t.pattern.test(line))) {
      asked.set(term, Math.max(asked.get(term) ?? 0, weight));
    }
  }
  return asked;
}

/**
 * How much of what the posting asks for the CV shows, weighted toward its requirements. Missing
 * terms come most-wanted first. A posting that names none of our terms scores 0 with empty lists.
 */
export function matchJobDescription(cvText: string, jobDescription: string): JobMatch {
  const asked = askedTerms(jobDescription);
  const terms = TERMS.filter((term) => asked.has(term));
  const weightOf = (term: Term) => asked.get(term) ?? 0;
  const inCv = terms.filter((term) => term.pattern.test(cvText));
  const missing = terms.filter((term) => !inCv.includes(term));
  const total = terms.reduce((sum, term) => sum + weightOf(term), 0);
  const shown = inCv.reduce((sum, term) => sum + weightOf(term), 0);
  return {
    score: total === 0 ? 0 : Math.round((shown / total) * 100),
    found: inCv.map((term) => term.label),
    missing: missing.sort((a, b) => weightOf(b) - weightOf(a)).map((term) => term.label),
  };
}
