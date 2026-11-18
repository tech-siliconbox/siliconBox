import type { CourseOutline } from '@siliconbox/shared';
import { modulesDone } from '../course-progress';

type CourseProgressBarProps = { course: CourseOutline; doneLessonIds: ReadonlySet<string> };

/** "3 of 11 modules done", with a bar. */
export function CourseProgressBar({ course, doneLessonIds }: CourseProgressBarProps) {
  const { done, total } = modulesDone(course, doneLessonIds);
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {done} of {total} modules done
      </p>
      <progress
        value={done}
        max={total}
        aria-label={`${course.title}: ${done} of ${total} modules done`}
        className="h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-success [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-success"
      />
    </div>
  );
}
