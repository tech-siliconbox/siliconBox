// A learner's activity by day: streaks and the year graph. Days are counted on India time, where
// the learners are, so a late-evening session counts for that evening, not the next UTC day.

/** Dates and days on the site are India time (ICU's canonical name for the zone). */
export const SITE_TIME_ZONE = 'Asia/Calcutta';
const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SITE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar day of an instant, as "YYYY-MM-DD" on India time. */
export const activityDay = (at: Date): string => dayFormat.format(at);

/** A day some days later (or earlier), as "YYYY-MM-DD"; stepping from UTC noon stays on the day. */
const shiftDay = (day: string, by: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);

/**
 * Days in a row with activity, ending today, or yesterday when today has none yet (a streak
 * stays alive until the day is over).
 */
export function currentStreak(days: ReadonlySet<string>, now: Date): number {
  let day = activityDay(now);
  if (!days.has(day)) day = shiftDay(day, -1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = shiftDay(day, -1);
  }
  return streak;
}

/** The most days in a row with activity, ever. */
export function longestStreak(days: ReadonlySet<string>): number {
  let longest = 0;
  for (const day of days) {
    if (days.has(shiftDay(day, -1))) continue;
    let length = 1;
    while (days.has(shiftDay(day, length))) length += 1;
    longest = Math.max(longest, length);
  }
  return longest;
}
