import { z } from 'zod';

export const CheckStatusSchema = z.enum(['pass', 'warn', 'fail']);

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
