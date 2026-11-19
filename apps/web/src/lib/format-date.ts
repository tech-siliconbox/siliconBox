import { SITE_TIME_ZONE } from '@siliconbox/shared';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: SITE_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const monthFormat = new Intl.DateTimeFormat('en-IN', { timeZone: SITE_TIME_ZONE, month: 'short' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** A date on India time, as "18 Feb 2027". */
export const formatDate = (at: Date): string => dateFormat.format(at);

/** A month on India time, as "Feb". */
export const formatMonth = (at: Date): string => monthFormat.format(at);

/** How long ago, as "3 hours ago" or "yesterday"; older than a week shows the date. */
export function formatTimeAgo(at: Date, now: Date): string {
  const elapsed = now.getTime() - at.getTime();
  if (elapsed >= WEEK_MS) return formatDate(at);
  const step = STEPS.find(([, ms]) => elapsed >= ms);
  return step === undefined ? 'just now' : relative.format(-Math.floor(elapsed / step[1]), step[0]);
}
