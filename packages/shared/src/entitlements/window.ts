import type { Window } from '../schemas/entitlement';

/** Active from the first instant of the window up to, but not including, its end. */
export function isActive(window: Window, now: Date): boolean {
  return window.startsAt <= now && now < window.endsAt;
}

/** Calendar months in UTC; clamps to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfMonth));
  return result;
}

export function windowFrom(startsAt: Date, months: number): Window {
  return { startsAt, endsAt: addMonths(startsAt, months) };
}
