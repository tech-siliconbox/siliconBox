import {
  RESUME_SECTIONS,
  RESUME_SECTION_TITLES,
  isBuiltInSection,
  type Resume,
  type ResumeSectionKey,
  formatResumeMonth,
  formatResumePeriod,
} from '../schemas/resume';

// A resume as what it prints: the header and its sections in order, already worded. The preview,
// the PDF, the Word file and Markdown all render this, so they print the same thing. Text in
// `text`, `description` and `bullets` may hold **bold** and *italic* (inline-text format).

export type ResumeEntry = {
  title: string;
  /** Right-aligned beside the title: dates, a year, a link. */
  meta: string;
  subtitle: string;
  description: string;
  bullets: string[];
};

export type ResumeBlock = { id: string; heading: string } & (
  | { kind: 'text'; text: string }
  | { kind: 'lines'; lines: { label: string; text: string }[] }
  | { kind: 'entries'; entries: ResumeEntry[] }
);

export type ResumeDocumentModel = {
  name: string;
  headline: string;
  contact: string[];
  blocks: ResumeBlock[];
};

/** An entry with its blank parts empty; bullets the editor keeps blank while typing are dropped. */
const entry = ({
  bullets = [],
  ...fields
}: Partial<ResumeEntry> & { title: string }): ResumeEntry => ({
  meta: '',
  subtitle: '',
  description: '',
  ...fields,
  bullets: bullets.filter((bullet) => bullet.trim() !== ''),
});

const joined = (...parts: string[]) => parts.filter((part) => part !== '').join(' · ');

type Content = Omit<ResumeBlock, 'id' | 'heading'> | null;

/** What each built-in section prints, or null when it has nothing to print. */
const BUILT_IN: Record<ResumeSectionKey, (resume: Resume) => Content> = {
  summary: ({ summary }) => (summary === '' ? null : { kind: 'text', text: summary }),
  skills: ({ skills }) =>
    skills.length === 0
      ? null
      : {
          kind: 'lines',
          lines: skills.map(({ category, items }) => ({ label: category, text: items.join(', ') })),
        },
  experience: ({ experience }) =>
    experience.length === 0
      ? null
      : {
          kind: 'entries',
          entries: experience.map((job) =>
            entry({
              title: `${job.role}, ${job.company}`,
              meta: formatResumePeriod(job.start, job.end),
              subtitle: job.location,
              bullets: job.bullets,
            }),
          ),
        },
  projects: ({ projects }) =>
    projects.length === 0
      ? null
      : {
          kind: 'entries',
          entries: projects.map((project) =>
            entry({ title: project.name, meta: project.link, bullets: project.bullets }),
          ),
        },
  education: ({ education }) =>
    education.length === 0
      ? null
      : {
          kind: 'entries',
          entries: education.map((school) =>
            entry({
              title: school.degree,
              meta: formatResumePeriod(school.start, school.end),
              subtitle: joined(school.institution, school.score),
            }),
          ),
        },
  certifications: ({ certifications }) =>
    certifications.length === 0
      ? null
      : {
          kind: 'entries',
          entries: certifications.map((cert) =>
            entry({ title: cert.name, meta: String(cert.year), subtitle: cert.issuer }),
          ),
        },
  awards: ({ awards }) =>
    awards.length === 0
      ? null
      : {
          kind: 'entries',
          entries: awards.map((award) =>
            entry({
              title: award.title,
              meta: formatResumeMonth(award.date),
              subtitle: award.issuer,
              description: award.summary,
            }),
          ),
        },
  publications: ({ publications }) =>
    publications.length === 0
      ? null
      : {
          kind: 'entries',
          entries: publications.map((paper) =>
            entry({
              title: paper.title,
              meta: formatResumeMonth(paper.date),
              subtitle: joined(paper.venue, paper.link),
            }),
          ),
        },
  languages: ({ languages }) =>
    languages.length === 0
      ? null
      : {
          kind: 'text',
          text: languages.map(({ name, level }) => `${name} (${level})`).join(', '),
        },
};

/**
 * Every section id in printed order: the learner's order first, then any section it leaves out,
 * built-in ones in their default order and then custom ones. Unknown ids are dropped.
 */
export function sectionOrder(resume: Resume): string[] {
  const known = [...RESUME_SECTIONS, ...resume.custom.map((section) => section.id)];
  const chosen = resume.sections.order.filter((id) => known.includes(id));
  const rest = known.filter((id) => !chosen.includes(id));
  return [...new Set([...chosen, ...rest])];
}

/** A section's heading: the learner's own name for it, or its default. */
export function sectionTitle(resume: Resume, id: string): string {
  if (isBuiltInSection(id)) {
    const own = resume.sections.titles[id]?.trim() ?? '';
    return own === '' ? RESUME_SECTION_TITLES[id] : own;
  }
  return resume.custom.find((section) => section.id === id)?.title ?? '';
}

function blockOf(resume: Resume, id: string): ResumeBlock | null {
  const heading = sectionTitle(resume, id);
  if (isBuiltInSection(id)) {
    const content = BUILT_IN[id](resume);
    return content === null ? null : ({ id, heading, ...content } as ResumeBlock);
  }
  const custom = resume.custom.find((section) => section.id === id);
  if (custom === undefined || custom.items.length === 0) return null;
  const entries = custom.items.map((item) =>
    entry({ title: item.title, meta: item.date, subtitle: item.subtitle, bullets: item.bullets }),
  );
  return { id, heading, kind: 'entries', entries };
}

/** The resume as printed: header, then each visible section that has something in it. */
export function resumeDocument(resume: Resume): ResumeDocumentModel {
  const { basics } = resume;
  const hidden = new Set<string>(resume.sections.hidden);
  return {
    name: basics.fullName,
    headline: basics.headline,
    contact: [
      basics.email,
      basics.phone,
      basics.location,
      ...basics.links.map((l) => l.url),
    ].filter((part) => part !== ''),
    blocks: sectionOrder(resume)
      .filter((id) => !hidden.has(id))
      .map((id) => blockOf(resume, id))
      .filter((block) => block !== null),
  };
}
