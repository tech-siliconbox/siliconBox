import { activityWeeks, currentStreak, longestStreak } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/shared/page-intro';
import { findCourseOutlines } from '@/db/content';
import { ActivityGraph } from '@/features/dashboard/components/activity-graph';
import { RecentActivity } from '@/features/dashboard/components/recent-activity';
import { StatTiles } from '@/features/dashboard/components/stat-tiles';
import { dayCounts, readActivity } from '@/server/activity';
import { requirePageIdentity } from '@/server/auth/page-identity';

export const metadata: Metadata = { title: 'Activity', robots: { index: false, follow: false } };

const RECENT = 20;

export default async function ActivityPage() {
  const identity = await requirePageIdentity();
  const now = new Date();
  const [courses, events] = await Promise.all([
    findCourseOutlines(),
    readActivity(identity.userId),
  ]);
  const counts = dayCounts(events);
  const days = new Set(counts.keys());
  return (
    <div className="flex flex-col gap-6">
      <PageIntro eyebrow="Activity" title="Your activity">
        Lessons you finished and Drills you ran, day by day (India time).
      </PageIntro>
      <StatTiles
        tiles={[
          { label: 'Day streak', value: currentStreak(days, now) },
          { label: 'Longest streak', value: longestStreak(days) },
          { label: 'Days active', value: days.size },
          { label: 'Lessons and runs', value: events.length },
        ]}
      />
      <ActivityGraph weeks={activityWeeks(counts, now)} />
      <RecentActivity events={events} courses={courses} now={now} limit={RECENT} />
    </div>
  );
}
