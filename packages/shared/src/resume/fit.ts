import {
  RESUME_LIST_LIMITS as N,
  RESUME_TEXT_LIMITS as T,
  type Resume,
  type ResumeLanguageLevel,
  ResumeSchema,
} from '../schemas/resume';

// Helpers for turning outside data (JSON Resume, LinkedIn, an AI reading of a CV) into a valid
// resume: dates to YYYY-MM, text cut to its limits, and entries that cannot be valid dropped.

/** "2024-06-29", "2024-06", "Jun 2024", "June 2024" or "2024" to "2024-06" ("2024" is January). */
export function toMonth(value: string | undefined): string {
  const text = (value ?? '').trim();
  const iso = /^(\d{4})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(text);
  if (named) {
    const index = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf((named[1] ?? '').toLowerCase());
    if (index >= 0 && index % 3 === 0)
      return `${named[2]}-${String(index / 3 + 1).padStart(2, '0')}`;
  }
  const year = /^(\d{4})$/.exec(text);
  return year ? `${year[1]}-01` : '';
}

/** At most `max` characters, cut at a word. */
export function cut(value: string | undefined, max: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const space = head.lastIndexOf(' ');
  return space > max / 2 ? head.slice(0, space) : head;
}

/** Lines of a description as bullets: bullet marks removed, blanks dropped, cut to the limits. */
export function toBullets(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*([•\-*▪●◦‣–]|\d+[.)])\s*/, ''))
    .map((line) => cut(line, T.bullet))
    .filter((line) => line !== '')
    .slice(0, N.bullets);
}

/** An https link, or '' (resumes keep https links only). */
export function toHttps(url: string | undefined): string {
  const text = (url ?? '').trim();
  if (text === '') return '';
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  return withScheme.replace(/^http:\/\//i, 'https://').slice(0, 200);
}

/** A free-text proficiency ("Full professional proficiency", "bilingual") to our levels. */
export function toLanguageLevel(text: string | undefined): ResumeLanguageLevel {
  const value = (text ?? '').toLowerCase();
  if (/native|bilingual|mother/.test(value)) return 'Native';
  if (/fluent|full professional|advanced|c2|c1/.test(value)) return 'Fluent';
  if (/limited|conversational|intermediate|b1|b2/.test(value)) return 'Conversational';
  if (/elementary|basic|beginner|a1|a2/.test(value)) return 'Basic';
  return 'Professional';
}

type Lists = Omit<Resume, 'template' | 'design' | 'sections' | 'basics' | 'summary'>;

/**
 * A resume from imported parts: each entry is checked on its own, so one bad entry is dropped
 * instead of failing the import. Returns how many entries were dropped.
 */
export function fitResume(
  base: Pick<Resume, 'basics' | 'summary'>,
  lists: { [K in keyof Lists]?: unknown[] },
): { resume: Resume; dropped: number } {
  let dropped = 0;
  const shape = ResumeSchema.shape;
  const keep = <K extends keyof Lists>(key: K): Lists[K] => {
    const element = shape[key].unwrap().element;
    const items = (lists[key] ?? []).flatMap((item) => {
      const parsed = element.safeParse(item);
      if (!parsed.success) dropped += 1;
      return parsed.success ? [parsed.data] : [];
    });
    return items.slice(0, N[key]) as Lists[K];
  };
  const resume = ResumeSchema.parse({
    basics: base.basics,
    summary: cut(base.summary, T.summary),
    skills: keep('skills'),
    experience: keep('experience'),
    projects: keep('projects'),
    education: keep('education'),
    certifications: keep('certifications'),
    awards: keep('awards'),
    publications: keep('publications'),
    languages: keep('languages'),
    custom: keep('custom'),
  });
  return { resume, dropped };
}
