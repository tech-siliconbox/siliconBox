import type { WindowStatus } from '@siliconbox/shared';
import { formatDate } from '@/lib/format-date';

/** An access window in words: open until a date, ended on one, or `none` when never bought. */
export function windowText(status: WindowStatus, none: string): string {
  if (status.state === 'active') return `Open until ${formatDate(status.endsAt)}`;
  if (status.state === 'ended') return `Ended ${formatDate(status.endedAt)}`;
  return none;
}
