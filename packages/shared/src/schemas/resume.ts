import { z } from 'zod';

// A learner's resume, saved by the Resume Builder and rendered to an ATS-friendly PDF or Word
// file: single column, real text, standard section headings. Every field added after the first
// version has a default, so resumes saved earlier still parse.

/** Single-column templates only: one reading order is what applicant tracking systems parse. */
export const RESUME_TEMPLATES = ['classic', 'compact', 'modern', 'minimal'] as const;
export const RESUME_FONTS = ['sans', 'serif'] as const;
export const RESUME_FONT_SIZES = [9, 9.5, 10, 10.5, 11, 11.5, 12] as const;
export const RESUME_SPACINGS = ['compact', 'normal', 'relaxed'] as const;
export const RESUME_MARGINS = ['narrow', 'normal', 'wide'] as const;
export const RESUME_PAGE_SIZES = ['A4', 'LETTER'] as const;

/** Dark accents only: they print well, photocopy well and keep their contrast. */
export const RESUME_ACCENTS = {
  black: '#121212',
  navy: '#1e3a5f',
  teal: '#0f5e5a',
  burgundy: '#7a1f2b',
  forest: '#2f5233',
  slate: '#3f4b5b',
} as const;
export type ResumeAccent = keyof typeof RESUME_ACCENTS;
const ACCENT_NAMES = Object.keys(RESUME_ACCENTS) as [ResumeAccent, ...ResumeAccent[]];

export const RESUME_LANGUAGE_LEVELS = [
  'Native',
  'Fluent',
  'Professional',
  'Conversational',
  'Basic',
] as const;
export type ResumeLanguageLevel = (typeof RESUME_LANGUAGE_LEVELS)[number];

/** Built-in sections in their default order; custom sections follow unless moved. */
export const RESUME_SECTIONS = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'awards',
  'publications',
  'languages',
] as const;
export type ResumeSectionKey = (typeof RESUME_SECTIONS)[number];

export const isBuiltInSection = (id: string): id is ResumeSectionKey =>
  (RESUME_SECTIONS as readonly string[]).includes(id);

export const RESUME_SECTION_TITLES: Readonly<Record<ResumeSectionKey, string>> = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  awards: 'Awards and achievements',
  publications: 'Publications',
  languages: 'Languages',
};

/** Resumes one learner may keep, for example one per kind of role. */
export const RESUMES_MAX = 5;

/** How many of each a resume holds; importers trim to the same numbers. */
export const RESUME_LIST_LIMITS = {
  links: 4,
  skills: 8,
  skillItems: 15,
  experience: 10,
  projects: 8,
  education: 5,
  certifications: 10,
  awards: 10,
  publications: 10,
  languages: 8,
  custom: 3,
  customItems: 10,
  bullets: 8,
} as const;

/** The longest free text, which imports cut to fit. */
export const RESUME_TEXT_LIMITS = { headline: 120, summary: 800, bullet: 300 } as const;

const N = RESUME_LIST_LIMITS;
const T = RESUME_TEXT_LIMITS;

const line = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/** "2024-06", or "Present" for an end date. */
const month = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const optionalMonth = month.or(z.literal('')).default('');
/** Bullets and the summary may use **bold** and *italic*. */
const bullets = z.array(required(T.bullet)).max(N.bullets);
const httpsUrl = z.url({ protocol: /^https$/ }).max(200);
const optionalUrl = httpsUrl.or(z.literal('')).default('');

const LinkSchema = z.strictObject({ label: required(30), url: httpsUrl });

/** A section in the order list: a built-in key or a custom section's id. */
export const ResumeSectionIdSchema = z.union([z.enum(RESUME_SECTIONS), z.uuid()]);

export const ResumeDesignSchema = z
  .strictObject({
    font: z.enum(RESUME_FONTS).default('sans'),
    fontSize: z.literal(RESUME_FONT_SIZES).default(10),
    spacing: z.enum(RESUME_SPACINGS).default('normal'),
    margins: z.enum(RESUME_MARGINS).default('normal'),
    accent: z.enum(ACCENT_NAMES).default('black'),
    pageSize: z.enum(RESUME_PAGE_SIZES).default('A4'),
  })
  .prefault({});
export type ResumeDesign = z.infer<typeof ResumeDesignSchema>;

const SectionsSchema = z
  .strictObject({
    /** The printed order; sections it leaves out follow in their default order. */
    order: z.array(ResumeSectionIdSchema).max(20).default([]),
    hidden: z.array(ResumeSectionIdSchema).max(20).default([]),
    /** Headings the learner renamed, such as "Technical skills". */
    titles: z.partialRecord(z.enum(RESUME_SECTIONS), line(40)).default({}),
  })
  .prefault({});

const CustomSectionSchema = z.strictObject({
  id: z.uuid(),
  title: required(40),
  items: z
    .array(
      z.strictObject({
        title: required(120),
        subtitle: line(120).default(''),
        /** Free text, such as "2023" or "Jan – Mar 2024". */
        date: line(40).default(''),
        bullets: bullets.default([]),
      }),
    )
    .max(N.customItems)
    .default([]),
});
export type CustomSection = z.infer<typeof CustomSectionSchema>;

export const ResumeSchema = z.strictObject({
  template: z.enum(RESUME_TEMPLATES).default('classic'),
  design: ResumeDesignSchema,
  sections: SectionsSchema,
  basics: z.strictObject({
    fullName: required(80),
    headline: line(T.headline).default(''),
    email: z.email().max(120),
    phone: line(30).default(''),
    location: line(80).default(''),
    links: z.array(LinkSchema).max(N.links).default([]),
  }),
  summary: line(T.summary).default(''),
  skills: z
    .array(
      z.strictObject({
        category: required(40),
        items: z.array(required(40)).min(1).max(N.skillItems),
      }),
    )
    .max(N.skills)
    .default([]),
  experience: z
    .array(
      z.strictObject({
        role: required(80),
        company: required(80),
        location: line(80).default(''),
        start: month,
        end: z.union([month, z.literal('Present')]),
        bullets,
      }),
    )
    .max(N.experience)
    .default([]),
  projects: z
    .array(z.strictObject({ name: required(80), link: optionalUrl, bullets }))
    .max(N.projects)
    .default([]),
  education: z
    .array(
      z.strictObject({
        degree: required(120),
        institution: required(120),
        start: month,
        end: month,
        score: line(30).default(''),
      }),
    )
    .max(N.education)
    .default([]),
  certifications: z
    .array(
      z.strictObject({
        name: required(120),
        issuer: line(80).default(''),
        year: z.number().int().min(1980).max(2100),
      }),
    )
    .max(N.certifications)
    .default([]),
  awards: z
    .array(
      z.strictObject({
        title: required(120),
        issuer: line(80).default(''),
        date: optionalMonth,
        summary: line(T.bullet).default(''),
      }),
    )
    .max(N.awards)
    .default([]),
  publications: z
    .array(
      z.strictObject({
        title: required(200),
        venue: line(120).default(''),
        date: optionalMonth,
        link: optionalUrl,
      }),
    )
    .max(N.publications)
    .default([]),
  languages: z
    .array(z.strictObject({ name: required(40), level: z.enum(RESUME_LANGUAGE_LEVELS) }))
    .max(N.languages)
    .default([]),
  custom: z.array(CustomSectionSchema).max(N.custom).default([]),
});
export type Resume = z.infer<typeof ResumeSchema>;

/** A blank resume started from the learner's account details. */
export function emptyResume(fullName: string, email: string): Resume {
  return ResumeSchema.parse({ basics: { fullName: fullName || 'Your name', email } });
}

/** A saved resume's name in the learner's list, such as "Formal verification, product teams". */
export const ResumeTitleSchema = required(60);

/** Creating or saving a resume: its name and its content. */
export const ResumeDocumentInputSchema = z.strictObject({
  title: ResumeTitleSchema,
  resume: ResumeSchema,
});
export type ResumeDocumentInput = z.infer<typeof ResumeDocumentInputSchema>;

/** One saved resume in the learner's list. */
export const ResumeSummarySchema = z.object({
  publicId: z.string(),
  title: z.string(),
  updatedAt: z.coerce.date(),
});
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;

/** One saved resume with its content. */
export const SavedResumeSchema = ResumeSummarySchema.extend({ resume: ResumeSchema });
export type SavedResume = z.infer<typeof SavedResumeSchema>;

/** An import's answer: the new resume, entries that could not be read, and dates to check. */
export const ResumeImportResultSchema = z.object({
  saved: SavedResumeSchema,
  dropped: z.number().int(),
  notes: z.array(z.string()).default([]),
});
export type ResumeImportResult = z.infer<typeof ResumeImportResultSchema>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-06" to "Jun 2024"; "Present" and "" stay as they are. */
export function formatResumeMonth(value: string): string {
  const [year, month] = value.split('-');
  const name = MONTHS[Number(month) - 1];
  return year === undefined || name === undefined ? value : `${name} ${year}`;
}

export function formatResumePeriod(start: string, end: string): string {
  return `${formatResumeMonth(start)} – ${formatResumeMonth(end)}`;
}
