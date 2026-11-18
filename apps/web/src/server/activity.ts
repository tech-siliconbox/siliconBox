import 'server-only';
import { activityDay } from '@siliconbox/shared';
import { findCompletions } from '@/db/progress';
import { findRunOutcomes } from '@/db/runs';
import { runSolved } from './runs';

/** One thing a learner did: finished a lesson, or ran a Drill (solved, not, or still grading). */
export type ActivityEvent =
  | { kind: 'lesson'; lessonId: string; at: Date }
  | { kind: 'run'; drillId: string; at: Date; solved: boolean | null };

/** A learner's finished lessons and Drill runs, newest first. */
export async function readActivity(userId: string): Promise<ActivityEvent[]> {
  const [completions, runs] = await Promise.all([findCompletions(userId), findRunOutcomes(userId)]);
  const events: ActivityEvent[] = [
    ...completions.map((done) => ({
      kind: 'lesson' as const,
      lessonId: done.lessonId,
      at: done.completedAt,
    })),
    ...runs.map((run) => ({
      kind: 'run' as const,
      drillId: run.drillId,
      at: run.createdAt,
      solved: runSolved(run),
    })),
  ];
  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** The days, on India time, with any activity: for streaks and the year graph. */
export const activeDays = (events: readonly ActivityEvent[]) =>
  new Set(events.map((event) => activityDay(event.at)));

/** The Drills solved at least once. */
export const solvedDrillIds = (events: readonly ActivityEvent[]) =>
  new Set(
    events.flatMap((event) =>
      event.kind === 'run' && event.solved === true ? [event.drillId] : [],
    ),
  );

/** The lessons finished. */
export const doneLessonIds = (events: readonly ActivityEvent[]) =>
  new Set(events.flatMap((event) => (event.kind === 'lesson' ? [event.lessonId] : [])));
