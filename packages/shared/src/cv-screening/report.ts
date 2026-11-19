import { z } from 'zod';

export const CheckStatusSchema = z.enum(['pass', 'warn', 'fail']);

/** How a CV covers the terms a pasted job description asks for; the description is not kept. */
export const JobMatchSchema = z.object({
  score: z.number().int().min(0).max(100),
  found: z.array(z.string()),
  missing: z.array(z.string()),
});
export type JobMatch = z.infer<typeof JobMatchSchema>;

export const CvReportSchema = z.object({
  score: z.number().int().min(0).max(100),
  categories: z.array(
    z.object({ id: z.string(), label: z.string(), score: z.number().int().min(0).max(100) }),
  ),
  checks: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      status: CheckStatusSchema,
      title: z.string(),
      detail: z.string(),
    }),
  ),
  keywords: z.object({ found: z.array(z.string()), missing: z.array(z.string()) }),
  words: z.number().int(),
  pages: z.number().int().nullable(),
  jobMatch: JobMatchSchema.optional(),
});
export type CvReport = z.infer<typeof CvReportSchema>;
export type CvCheck = CvReport['checks'][number];

/** One saved screening: the report only, never the uploaded file. */
export const CvScreeningSchema = z.object({
  publicId: z.string(),
  fileName: z.string(),
  createdAt: z.coerce.date(),
  report: CvReportSchema,
});
export type CvScreening = z.infer<typeof CvScreeningSchema>;

/** Longest job description we match against; real postings are well under this. */
export const JOB_DESCRIPTION_MAX_CHARS = 8000;

/** What a learner may add to a screening: a job description to match the CV against. */
export const ScreeningOptionsSchema = z.strictObject({
  jobDescription: z.string().trim().min(1).max(JOB_DESCRIPTION_MAX_CHARS).optional(),
});
export type ScreeningOptions = z.infer<typeof ScreeningOptionsSchema>;

/** The options from the job description box: none when it is blank. */
export function screeningOptions(jobDescription: string): ScreeningOptions {
  const text = jobDescription.trim();
  return text === '' ? {} : { jobDescription: text };
}

/** The Resume Builder's check: the report and the text an ATS reads from the PDF; nothing saved. */
export const ResumeCheckSchema = z.object({ report: CvReportSchema, atsText: z.string() });
export type ResumeCheck = z.infer<typeof ResumeCheckSchema>;

/** A new screening: the saved screening and the text read from the file, which is not saved. */
export const NewScreeningSchema = z.object({ screening: CvScreeningSchema, atsText: z.string() });
