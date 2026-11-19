import { type CourseOutline, outlineLinks } from '@siliconbox/shared';
import { SiteLink } from '@/components/ui/site-link';
import { formatTimeAgo } from '@/lib/format-date';
import type { ActivityEvent } from '@/server/activity';
import { Panel } from './panel';

const RUN_WORD = { true: 'Solved', false: 'Tried', null: 'Checking' } as const;

type RecentActivityProps = {
  events: readonly ActivityEvent[];
  courses: readonly CourseOutline[];
  now: Date;
  limit: number;
};

/** The latest lessons finished and Drill runs, newest first, each linking to its page. */
export function RecentActivity({ events, courses, now, limit }: RecentActivityProps) {
  const links = outlineLinks(courses);
  const rows = events.slice(0, limit).flatMap((event) => {
    const link =
      event.kind === 'lesson' ? links.lessons.get(event.lessonId) : links.drills.get(event.drillId);
    const word = event.kind === 'lesson' ? 'Finished' : RUN_WORD[`${event.solved}`];
    return link === undefined ? [] : [{ ...link, word, at: event.at }];
  });
  return (
    <Panel title="Recent activity">
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ title, href, word, at }) => (
            <li key={`${href}${at.getTime()}`} className="flex flex-col gap-0.5 px-5 py-3 text-sm">
              <SiteLink href={href} className="font-medium hover:underline">
                {title}
              </SiteLink>
              <span className="text-[12px] text-muted-foreground">
                {word} · {formatTimeAgo(at, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
