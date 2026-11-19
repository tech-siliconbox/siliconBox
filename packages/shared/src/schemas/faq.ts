import { z } from 'zod';

/** One published question and answer on the Help page. */
export const FaqSchema = z.object({ question: z.string().min(1), answer: z.string().min(1) });
export type Faq = z.infer<typeof FaqSchema>;
