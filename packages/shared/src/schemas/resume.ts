import { z } from 'zod';

// A learner's resume, saved by the Resume Builder and rendered to an ATS-friendly PDF:
// single column, real text, standard section headings.

export const RESUME_TEMPLATES = ['classic', 'compact'] as const;

const line = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/** "2024-06", or "Present" for an end date. */
const month = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const bullets = z.array(required(300)).max(8);
const httpsUrl = z.url({ protocol: /^https$/ }).max(200);

const LinkSchema = z.strictObject({ label: required(30), url: httpsUrl });

export const ResumeSchema = z.strictObject({
  template: z.enum(RESUME_TEMPLATES).default('classic'),
  basics: z.strictObject({
    fullName: required(80),
    headline: line(120).default(''),
    email: z.email().max(120),
    phone: line(30).default(''),
    location: line(80).default(''),
    links: z.array(LinkSchema).max(4).default([]),
  }),
  summary: line(800).default(''),
  skills: z
    .array(z.strictObject({ category: required(40), items: z.array(required(40)).min(1).max(15) }))
    .max(8)
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
    .max(10)
    .default([]),
  projects: z
    .array(
      z.strictObject({ name: required(80), link: httpsUrl.or(z.literal('')).default(''), bullets }),
    )
    .max(8)
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
    .max(5)
    .default([]),
  certifications: z
    .array(
      z.strictObject({
        name: required(120),
        issuer: line(80).default(''),
        year: z.number().int().min(1980).max(2100),
      }),
    )
    .max(10)
    .default([]),
});
export type Resume = z.infer<typeof ResumeSchema>;

/** A blank resume started from the learner's account details. */
export function emptyResume(fullName: string, email: string): Resume {
  return ResumeSchema.parse({ basics: { fullName: fullName || 'Your name', email } });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-06" to "Jun 2024"; "Present" stays as it is. */
export function formatResumeMonth(value: string): string {
  const [year, month] = value.split('-');
  const name = MONTHS[Number(month) - 1];
  return year === undefined || name === undefined ? value : `${name} ${year}`;
}

export function formatResumePeriod(start: string, end: string): string {
  return `${formatResumeMonth(start)} \u2013 ${formatResumeMonth(end)}`;
}
