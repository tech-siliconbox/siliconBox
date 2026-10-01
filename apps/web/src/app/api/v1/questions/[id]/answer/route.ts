import { paidReadRoute } from '@/server/api/paid-read-route';
import { readAnswer } from '@/server/answers';

/** One question's paid answer: paced, entitlement-checked, watermarked, private no-store. */
export const GET = paidReadRoute(readAnswer);
