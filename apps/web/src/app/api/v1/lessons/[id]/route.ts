import { paidReadRoute } from '@/server/api/paid-read-route';
import { readLesson } from '@/server/lessons';

/** One published lesson as blocks: paced, entitlement-checked, watermarked, private no-store. */
export const GET = paidReadRoute(readLesson);
