const MINUTES_PER_HOUR = 60;

/** A reading time for people: "45 min", "2.5 h", "3 h". */
export function formatDuration(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min`;
  return `${Number((minutes / MINUTES_PER_HOUR).toFixed(1))} h`;
}
