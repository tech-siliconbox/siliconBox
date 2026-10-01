import { z } from 'zod';

/** Signs of account sharing or scraping (docs/architecture/content-delivery.md, anti-crawl). */
export const AlertKindSchema = z.enum([
  'signin_new_country',
  'headless_browser',
  'content_daily_cap',
]);
export type AlertKind = z.infer<typeof AlertKindSchema>;
