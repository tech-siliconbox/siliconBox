import { z } from 'zod';

/**
 * What an admin pastes into the watermark trace tool: leaked text (it may carry the invisible
 * mark) or the visible mark read off a screenshot. Size-capped; never put in a URL or a log.
 */
export const WatermarkTraceInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(100_000),
});
export type WatermarkTraceInput = z.infer<typeof WatermarkTraceInputSchema>;
