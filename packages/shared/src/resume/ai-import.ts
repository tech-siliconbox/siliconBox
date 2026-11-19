import { z } from 'zod';
import { wordsOf } from '../ai/checks';
import { nonEmptyLines } from '../cv-screening/lines';
import { EMAIL, WEB_LINK, phoneNumbers } from '../cv-screening/personal-data';
import { looksLikeName } from '../cv-screening/redact';
import { RESUME_LIST_LIMITS as N, type Resume } from '../schemas/resume';
import { cut, fitResume, toBullets, toHttps, toLanguageLevel, toMonth } from './fit';

// Importing a CV into the builder with AI (ADR 0030). The contact details are read here, from
// the file, and never sent; the model reads the redacted text into sections, and only what the
// CV itself says is kept.

const entries = <T extends z.ZodRawShape>(shape: T) => z.array(z.strictObject(shape));
const s = z.string();

/** What the model must return: the CV's sections as written, dates as YYYY-MM. */
export const ImportAnswerSchema = z.strictObject({
  headline: s,
  summary: s,
  skills: entries({ category: s, items: z.array(s) }),
  experience: entries({ role: s, company: s, location: s, start: s, end: s, bullets: z.array(s) }),
  projects: entries({ name: s, link: s, bullets: z.array(s) }),
  education: entries({ degree: s, institution: s, start: s, end: s, score: s }),
  certifications: entries({ name: s, issuer: s, year: s }),
  awards: entries({ title: s, issuer: s, date: s, summary: s }),
  publications: entries({ title: s, venue: s, date: s, link: s }),
  languages: entries({ name: s, level: s }),
});
export type ImportAnswer = z.infer<typeof ImportAnswerSchema>;

type Account = { name: string; email: string };

/** Name, email, phone and links read from the CV itself; the account fills what is missing. */
export function contactFromCv(text: string, account: Account): Resume['basics'] {
  const first = nonEmptyLines(text)[0] ?? '';
  const links = [...text.matchAll(new RegExp(WEB_LINK.source, 'gi'))]
    .map((match) => toHttps(match[0].replace(/[),.;]+$/, '')))
    .filter((url) => url !== '')
    .slice(0, N.links)
    .map((url) => ({
      label: /linkedin/i.test(url) ? 'LinkedIn' : /github/i.test(url) ? 'GitHub' : 'Website',
      url,
    }));
  return {
    fullName: looksLikeName(first) ? cut(first, 80) : account.name || 'Your name',
    headline: '',
    email: EMAIL.exec(text)?.[0] ?? account.email,
    phone: cut(phoneNumbers(text)[0], 30),
    location: '',
    links,
  };
}

/** Whether most of the words of `value` appear in the CV: the model may reword, not invent. */
function grounded(value: string, source: ReadonlySet<string>): boolean {
  const words = wordsOf(value).filter((word) => word.length >= 3);
  return (
    words.length === 0 || words.filter((word) => source.has(word)).length / words.length >= 0.7
  );
}

/** Keeps text only where the CV says it: a field the CV does not support is emptied. */
type Grounding = {
  keep: (value: string, max: number) => string;
  bullets: (items: string[]) => string[];
};

function groundedWork(answer: ImportAnswer, { keep, bullets }: Grounding) {
  return {
    experience: answer.experience.map((job) => ({
      role: keep(job.role, 80),
      company: keep(job.company, 80),
      location: keep(job.location, 80),
      start: toMonth(job.start),
      end: /present|current|now/i.test(job.end) ? 'Present' : toMonth(job.end),
      bullets: bullets(job.bullets),
    })),
    projects: answer.projects.map((project) => ({
      name: keep(project.name, 80),
      link: toHttps(project.link),
      bullets: bullets(project.bullets),
    })),
    education: answer.education.map((school) => ({
      degree: keep(school.degree, 120),
      institution: keep(school.institution, 120),
      start: toMonth(school.start),
      end: toMonth(school.end),
      score: keep(school.score, 30),
    })),
  };
}

function groundedExtras(answer: ImportAnswer, { keep }: Grounding) {
  return {
    skills: answer.skills.map((group) => ({
      category: keep(group.category, 40) || 'Skills',
      items: group.items
        .map((item) => keep(item, 40))
        .filter(Boolean)
        .slice(0, N.skillItems),
    })),
    certifications: answer.certifications.map((cert) => ({
      name: keep(cert.name, 120),
      issuer: keep(cert.issuer, 80),
      year: Number(toMonth(cert.year).slice(0, 4)),
    })),
    awards: answer.awards.map((award) => ({
      title: keep(award.title, 120),
      issuer: keep(award.issuer, 80),
      date: toMonth(award.date),
      summary: keep(award.summary, 300),
    })),
    publications: answer.publications.map((paper) => ({
      title: keep(paper.title, 200),
      venue: keep(paper.venue, 120),
      date: toMonth(paper.date),
      link: toHttps(paper.link),
    })),
    languages: answer.languages.map((language) => ({
      name: keep(language.name, 40),
      level: toLanguageLevel(language.level),
    })),
  };
}

/**
 * The model's reading as a resume: text that the CV does not support is left out (a bullet) or
 * empties its field, dates become YYYY-MM, and entries that cannot be valid are dropped.
 */
export function fitImport(
  answer: ImportAnswer,
  { sourceText, basics }: { sourceText: string; basics: Resume['basics'] },
): { resume: Resume; dropped: number } {
  const source = new Set(wordsOf(sourceText));
  const grounding: Grounding = {
    keep: (value, max) => (grounded(value, source) ? cut(value, max) : ''),
    bullets: (items) => toBullets(items.filter((item) => grounded(item, source)).join('\n')),
  };
  return fitResume(
    {
      basics: { ...basics, headline: grounding.keep(answer.headline, 120) },
      summary: grounding.keep(answer.summary, 800),
    },
    { ...groundedWork(answer, grounding), ...groundedExtras(answer, grounding) },
  );
}
