import { z } from 'zod';
import { type Resume, ResumeSchema } from '../schemas/resume';
import { cut, fitResume, toBullets, toHttps, toLanguageLevel, toMonth } from './fit';

// JSON Resume (jsonresume.org, MIT), the open format most resume tools read and write. Our
// design, section order and custom sections travel in its open `meta` object, so a file we
// export comes back unchanged; a file from elsewhere keeps what JSON Resume can say.

const text = z.string().optional().catch(undefined);
const list = <T extends z.ZodType>(item: T) =>
  z.array(item.nullable().catch(null)).optional().catch([]);
const loose = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

/** What we read from a JSON Resume file; everything is optional and anything odd is ignored. */
const JsonResumeSchema = loose({
  basics: loose({
    name: text,
    label: text,
    email: text,
    phone: text,
    summary: text,
    location: loose({ address: text, city: text, region: text }).catch({}),
    profiles: list(loose({ network: text, url: text })),
  }).catch({ location: {} }),
  work: list(
    loose({
      name: text,
      position: text,
      location: text,
      startDate: text,
      endDate: text,
      summary: text,
      highlights: z.array(z.string()).optional().catch([]),
    }),
  ),
  projects: list(
    loose({
      name: text,
      url: text,
      description: text,
      highlights: z.array(z.string()).optional().catch([]),
    }),
  ),
  education: list(
    loose({
      institution: text,
      area: text,
      studyType: text,
      startDate: text,
      endDate: text,
      score: text,
    }),
  ),
  certificates: list(loose({ name: text, issuer: text, date: text })),
  awards: list(loose({ title: text, awarder: text, date: text, summary: text })),
  publications: list(loose({ name: text, publisher: text, releaseDate: text, url: text })),
  skills: list(loose({ name: text, keywords: z.array(z.string()).optional().catch([]) })),
  languages: list(loose({ language: text, fluency: text })),
  meta: loose({ siliconbox: z.unknown().optional() }).optional().catch(undefined),
});

/** Our own settings and custom sections, carried in `meta.siliconbox`. */
const SiliconBoxMetaSchema = ResumeSchema.pick({
  template: true,
  design: true,
  sections: true,
  custom: true,
});

/** The header and contact details in JSON Resume's names. */
function jsonBasics({ basics, summary }: Resume) {
  return {
    name: basics.fullName,
    label: basics.headline,
    email: basics.email,
    phone: basics.phone,
    summary,
    location: { address: basics.location },
    profiles: basics.links.map(({ label, url }) => ({ network: label, url })),
  };
}

/** Work, projects and education in JSON Resume's names. */
function jsonWork(resume: Resume) {
  return {
    work: resume.experience.map((job) => ({
      name: job.company,
      position: job.role,
      location: job.location,
      startDate: job.start,
      ...(job.end === 'Present' ? {} : { endDate: job.end }),
      highlights: job.bullets,
    })),
    projects: resume.projects.map(({ name, link, bullets }) => ({
      name,
      url: link,
      highlights: bullets,
    })),
    education: resume.education.map((school) => ({
      institution: school.institution,
      studyType: school.degree,
      startDate: school.start,
      endDate: school.end,
      score: school.score,
    })),
  };
}

/** Certificates, awards, publications, skills and languages in JSON Resume's names. */
function jsonExtras(resume: Resume) {
  return {
    certificates: resume.certifications.map(({ name, issuer, year }) => ({
      name,
      issuer,
      date: String(year),
    })),
    awards: resume.awards.map(({ title, issuer, date, summary }) => ({
      title,
      awarder: issuer,
      date,
      summary,
    })),
    publications: resume.publications.map(({ title, venue, date, link }) => ({
      name: title,
      publisher: venue,
      releaseDate: date,
      url: link,
    })),
    skills: resume.skills.map(({ category, items }) => ({ name: category, keywords: items })),
    languages: resume.languages.map(({ name, level }) => ({ language: name, fluency: level })),
  };
}

/** The resume as a JSON Resume document (schema v1.0.0), our settings in `meta.siliconbox`. */
export function toJsonResume(resume: Resume) {
  const { template, design, sections, custom } = resume;
  return {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: jsonBasics(resume),
    ...jsonWork(resume),
    ...jsonExtras(resume),
    meta: { version: 'v1.0.0', siliconbox: { template, design, sections, custom } },
  };
}

type Account = { name: string; email: string };
type JsonResume = z.infer<typeof JsonResumeSchema>;

const present = <T>(items: (T | null)[] | undefined): T[] =>
  (items ?? []).filter((item): item is T => item !== null);

/** Highlights as bullets, or the description when there are none. */
const bulletsOf = (highlights: string[] | undefined, text: string | undefined) =>
  toBullets((highlights?.length ? highlights : [text ?? '']).join('\n'));

function importedBasics(
  { basics }: JsonResume,
  account: Account,
): Pick<Resume, 'basics' | 'summary'> {
  const { location } = basics;
  const place =
    cut(location.address, 80) || [location.city, location.region].filter(Boolean).join(', ');
  const links = present(basics.profiles)
    .map((profile) => ({ label: cut(profile.network, 30) || 'Link', url: toHttps(profile.url) }))
    .filter((link) => link.url !== '');
  return {
    basics: {
      fullName: cut(basics.name, 80) || account.name || 'Your name',
      headline: cut(basics.label, 120),
      email: z.email().safeParse(basics.email).data ?? account.email,
      phone: cut(basics.phone, 30),
      location: cut(place, 80),
      links: links.slice(0, 4),
    },
    summary: basics.summary ?? '',
  };
}

function importedWork(doc: JsonResume) {
  return {
    experience: present(doc.work).map((job) => ({
      role: cut(job.position, 80),
      company: cut(job.name, 80),
      location: cut(job.location, 80),
      start: toMonth(job.startDate),
      end: toMonth(job.endDate) || 'Present',
      bullets: bulletsOf(job.highlights, job.summary),
    })),
    projects: present(doc.projects).map((project) => ({
      name: cut(project.name, 80),
      link: toHttps(project.url),
      bullets: bulletsOf(project.highlights, project.description),
    })),
    education: present(doc.education).map((school) => ({
      degree: cut([school.studyType, school.area].filter(Boolean).join(', '), 120),
      institution: cut(school.institution, 120),
      start: toMonth(school.startDate),
      end: toMonth(school.endDate),
      score: cut(school.score, 30),
    })),
  };
}

function importedExtras(doc: JsonResume) {
  return {
    certifications: present(doc.certificates).map((cert) => ({
      name: cut(cert.name, 120),
      issuer: cut(cert.issuer, 80),
      year: Number(toMonth(cert.date).slice(0, 4)),
    })),
    awards: present(doc.awards).map((award) => ({
      title: cut(award.title, 120),
      issuer: cut(award.awarder, 80),
      date: toMonth(award.date),
      summary: cut(award.summary, 300),
    })),
    publications: present(doc.publications).map((paper) => ({
      title: cut(paper.name, 200),
      venue: cut(paper.publisher, 120),
      date: toMonth(paper.releaseDate),
      link: toHttps(paper.url),
    })),
    skills: present(doc.skills).map((skill) => ({
      category: cut(skill.name, 40) || 'Skills',
      items: (skill.keywords ?? [])
        .map((item) => cut(item, 40))
        .filter(Boolean)
        .slice(0, 15),
    })),
    languages: present(doc.languages).map((language) => ({
      name: cut(language.language, 40),
      level: toLanguageLevel(language.fluency),
    })),
  };
}

/**
 * A resume from a JSON Resume document; the account fills a missing name or email. Entries that
 * cannot be valid (no start date, no title) are dropped and counted.
 */
export function fromJsonResume(
  value: unknown,
  account: Account,
): { resume: Resume; dropped: number } | null {
  const parsed = JsonResumeSchema.safeParse(value);
  if (!parsed.success) return null;
  const doc = parsed.data;
  const { resume, dropped } = fitResume(importedBasics(doc, account), {
    ...importedWork(doc),
    ...importedExtras(doc),
  });
  const ours = SiliconBoxMetaSchema.safeParse(doc.meta?.siliconbox);
  return { resume: ours.success ? { ...resume, ...ours.data } : resume, dropped };
}
