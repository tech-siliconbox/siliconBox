import { FORMAL_VERIFICATION_KEYWORDS } from './keywords';
import type { CvCheck, CvReport } from './report';

// Rule-based screening of a CV's text, the way an applicant tracking system (ATS) and a
// recruiter would read it for a formal verification role. Pure: text in, report out.

type Status = CvCheck['status'];
type Rule = (cv: ParsedCv) => CvCheck;
type ParsedCv = {
  text: string;
  lines: string[];
  bullets: string[];
  words: number;
  pages: number | null;
};

const CATEGORIES = [
  { id: 'readable', label: 'ATS can read it', weight: 15 },
  { id: 'contact', label: 'Contact details', weight: 10 },
  { id: 'structure', label: 'Sections', weight: 20 },
  { id: 'length', label: 'Length', weight: 10 },
  { id: 'impact', label: 'Impact', weight: 20 },
  { id: 'keywords', label: 'Formal verification keywords', weight: 25 },
] as const;

const STATUS_SCORE: Record<Status, number> = { pass: 100, warn: 50, fail: 0 };
/** Below this, the file is effectively unreadable (a scanned image or a design-tool export). */
const MIN_READABLE_WORDS = 25;
const BULLET = /^\s*([•\-*▪●◦‣–]|\d+[.)])\s+/;
const ACTION_VERB =
  /^(designed|developed|verified|implemented|wrote|built|led|reduced|improved|optimi[sz]ed|automated|debugged|created|authored|proved|closed|achieved|delivered|analy[sz]ed|integrated|migrated|mentored|owned|found|identified|increased|decreased|accelerated|architected|validated|tested|modell?ed|specified|drove|managed|ran|set up|introduced)\b/i;
const PERSONAL_DETAILS =
  /\b(date of birth|d\.?o\.?b\.?|marital status|religion|caste|father'?s name|mother'?s name|nationality|gender)\b/i;

/** A check builder bound to one report area. */
function checker(category: string) {
  return (id: string, status: Status, title: string, detail: string): CvCheck => ({
    id,
    category,
    status,
    title,
    detail,
  });
}
const readable = checker('readable');
const contact = checker('contact');
const structure = checker('structure');
const length = checker('length');
const impact = checker('impact');

function parse(text: string, pages: number | null): ParsedCv {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const bullets = lines.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, ''));
  const words = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return { text, lines, bullets, words, pages };
}

const hasHeading = (cv: ParsedCv, pattern: RegExp) =>
  cv.lines.some((line) => line.length <= 40 && pattern.test(line));

function sectionRule(name: string, pattern: RegExp, missing: Status): Rule {
  const id = name.toLowerCase();
  return (cv) =>
    hasHeading(cv, pattern)
      ? structure(
          id,
          'pass',
          `${name} section found`,
          `Recruiters and ATS look for a "${name}" heading.`,
        )
      : structure(id, missing, `No ${name} section`, `Add a clearly titled "${name}" section.`);
}

const RULES: Rule[] = [
  (cv) =>
    cv.words >= MIN_READABLE_WORDS
      ? readable('text', 'pass', 'Text can be read', `We read ${cv.words} words from the file.`)
      : readable(
          'text',
          'fail',
          'Too little readable text',
          'If this is a scanned image or a design-tool export, an ATS cannot read it either. Export a text-based PDF.',
        ),
  (cv) =>
    /[\w.+-]+@[\w-]+\.[\w.]+/.test(cv.text)
      ? contact('email', 'pass', 'Email address found', 'Use a professional address.')
      : contact('email', 'fail', 'No email address', 'Put your email at the top.'),
  (cv) =>
    hasPhoneNumber(cv.text)
      ? contact('phone', 'pass', 'Phone number found', 'Include the country code, for example +91.')
      : contact(
          'phone',
          'warn',
          'No phone number',
          'Recruiters in India often call first; add a number.',
        ),
  (cv) =>
    /linkedin\.com\/in\/|github\.com\//i.test(cv.text)
      ? contact(
          'profiles',
          'pass',
          'LinkedIn or GitHub link found',
          'Profiles let reviewers check your work.',
        )
      : contact(
          'profiles',
          'warn',
          'No LinkedIn or GitHub link',
          'Add a LinkedIn profile, and GitHub if you have verification projects.',
        ),
  sectionRule('Summary', /^(professional )?(summary|profile|objective|about me)\b/i, 'warn'),
  sectionRule('Skills', /^(technical )?skills\b|^core competencies\b/i, 'fail'),
  sectionRule(
    'Experience',
    /^(work |professional )?experience\b|^employment\b|^internships?\b/i,
    'warn',
  ),
  sectionRule('Projects', /^(academic |personal |key )?projects\b/i, 'warn'),
  sectionRule('Education', /^education\b|^academic (background|qualifications?)\b/i, 'fail'),
  (cv) =>
    PERSONAL_DETAILS.test(cv.text)
      ? structure(
          'personal',
          'warn',
          'Personal details found',
          'Remove date of birth, marital status, religion, parents’ names and similar. They are not needed and invite bias.',
        )
      : structure(
          'personal',
          'pass',
          'No unnecessary personal details',
          'Good: only professional information.',
        ),
  wordCountRule,
  (cv) =>
    cv.pages === null || cv.pages <= 2
      ? length(
          'pages',
          'pass',
          'Two pages or fewer',
          'Keep it to one page early in your career, two at most.',
        )
      : length(
          'pages',
          'warn',
          `${cv.pages} pages`,
          'Cut to two pages: keep the most relevant verification work.',
        ),
  (cv) =>
    cv.bullets.length >= 6
      ? impact(
          'bullets',
          'pass',
          `${cv.bullets.length} bullet points`,
          'Bullets make achievements easy to scan.',
        )
      : impact(
          'bullets',
          cv.bullets.length === 0 ? 'fail' : 'warn',
          cv.bullets.length === 0 ? 'No bullet points' : 'Few bullet points',
          'Describe experience and projects as short bullets, not paragraphs.',
        ),
  (cv) =>
    ratioRule(cv, {
      id: 'verbs',
      pattern: ACTION_VERB,
      wanted: 0.5,
      titles: ['Bullets start with action verbs', 'Start more bullets with an action verb'],
    }),
  (cv) =>
    ratioRule(cv, {
      id: 'numbers',
      pattern: /\d/,
      wanted: 0.3,
      titles: [
        'Results are quantified',
        'Quantify more results (bugs found, properties, coverage %)',
      ],
    }),
  (cv) =>
    usesFirstPerson(cv)
      ? impact(
          'pronouns',
          'warn',
          'Written in the first person',
          'Drop "I" and "my": start bullets with the action.',
        )
      : impact('pronouns', 'pass', 'Concise, impersonal style', 'Bullets read as achievements.'),
];

function wordCountRule(cv: ParsedCv): CvCheck {
  const title = `${cv.words} words`;
  if (cv.words >= 350 && cv.words <= 900)
    return length('words', 'pass', title, 'A good length for one to two pages.');
  if (cv.words >= 200 && cv.words <= 1200) {
    const advice =
      cv.words < 350
        ? 'A little short: add detail on what you verified and how.'
        : 'A little long: keep what matters for verification roles.';
    return length('words', 'warn', title, advice);
  }
  const advice =
    cv.words < 200 ? 'Too short to show your work.' : 'Too long for a recruiter to read.';
  return length('words', 'fail', title, advice);
}

type RatioRule = { id: string; pattern: RegExp; wanted: number; titles: [string, string] };

/** A run of digits, spaces and dashes holding at least 10 digits, so dates do not count. */
function hasPhoneNumber(text: string): boolean {
  return (text.match(/\+?\d[\d\s-]{8,}\d/g) ?? []).some(
    (run) => run.replace(/\D/g, '').length >= 10,
  );
}

/** Passes when at least `wanted` of the bullets match `pattern`. */
function ratioRule(cv: ParsedCv, { id, pattern, wanted, titles }: RatioRule): CvCheck {
  if (cv.bullets.length === 0) return impact(id, 'fail', titles[1], 'Add bullet points first.');
  const share = cv.bullets.filter((bullet) => pattern.test(bullet)).length / cv.bullets.length;
  const detail = `${Math.round(share * 100)}% of bullets`;
  return share >= wanted
    ? impact(id, 'pass', titles[0], detail)
    : impact(id, 'warn', titles[1], detail);
}

/** Three or more of "I", "me", "my", and more than two per hundred words. */
function usesFirstPerson(cv: ParsedCv): boolean {
  const count = (cv.text.match(/\b(I|me|my)\b/gi) ?? []).length;
  return count >= 3 && count / Math.max(cv.words, 1) > 0.02;
}

function keywordCoverage(text: string) {
  const all = FORMAL_VERIFICATION_KEYWORDS.flatMap((group) => group.keywords);
  const found = all.filter((keyword) => keyword.pattern.test(text)).map((keyword) => keyword.label);
  const missing = all.map((keyword) => keyword.label).filter((label) => !found.includes(label));
  // Covering half the list is a strong CV; nobody uses every tool.
  const score = Math.min(100, Math.round((found.length / all.length / 0.5) * 100));
  return { found, missing, score };
}

function areaScore(checks: CvCheck[], id: string): number {
  const own = checks.filter((c) => c.category === id);
  return Math.round(
    own.reduce((sum, c) => sum + STATUS_SCORE[c.status], 0) / Math.max(own.length, 1),
  );
}

/** Screens a CV's extracted text; `pages` is known for PDFs only. */
export function screenCv(text: string, pages: number | null): CvReport {
  const cv = parse(text, pages);
  const checks = RULES.map((rule) => rule(cv));
  const keywords = keywordCoverage(text);
  const categories = CATEGORIES.map(({ id, label }) => ({
    id,
    label,
    score: id === 'keywords' ? keywords.score : areaScore(checks, id),
  }));
  const weighted =
    CATEGORIES.reduce(
      (sum, { weight }, index) => sum + weight * (categories[index]?.score ?? 0),
      0,
    ) / 100;
  // Unreadable text caps the score: nothing else matters if an ATS sees a blank page.
  const score = Math.round(cv.words < MIN_READABLE_WORDS ? Math.min(20, weighted) : weighted);
  return {
    score,
    categories,
    checks,
    keywords: { found: keywords.found, missing: keywords.missing },
    words: cv.words,
    pages,
  };
}
