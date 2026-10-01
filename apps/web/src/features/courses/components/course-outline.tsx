import { type CourseOutline, LEVEL_LABELS, ROUTES } from '@siliconbox/shared';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type CourseOutlineViewProps = { course: CourseOutline; doneLessonIds: ReadonlySet<string> };

/** A course's modules and lesson titles. Lessons open only after sign-in and entitlement. */
export function CourseOutlineView({ course, doneLessonIds }: CourseOutlineViewProps) {
  return (
    <div className="flex flex-col gap-6">
      {course.modules.map((module, index) => (
        <section key={module.title} className="rounded-card border border-border">
          <header className="flex flex-col gap-1 border-b border-border px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Module {index + 1}
            </p>
            <h2 className="text-[15px] font-semibold tracking-tight">{module.title}</h2>
            {module.summary && (
              <p className="text-[12px] text-muted-foreground">{module.summary}</p>
            )}
          </header>
          <ol className="divide-y divide-border">
            {module.lessons.map((lesson) => (
              <li key={lesson.publicId} className="flex items-center gap-3 px-5 py-3.5">
                <span aria-hidden="true" className="w-4 font-mono text-[12px]">
                  {doneLessonIds.has(lesson.publicId) ? '✓' : ''}
                </span>
                <Link
                  aria-label={
                    doneLessonIds.has(lesson.publicId) ? `${lesson.title} (done)` : undefined
                  }
                  href={ROUTES.lesson(lesson.publicId)}
                  className="flex-1 text-[13px] hover:underline"
                >
                  {lesson.title}
                </Link>
                {lesson.preview && <Badge>Free preview</Badge>}
                {lesson.durationMinutes && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {lesson.durationMinutes} min
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function CourseLevelBadge({ course }: { course: CourseOutline }) {
  return (
    <Badge variant="muted" className="w-fit">
      {LEVEL_LABELS[course.level]}
    </Badge>
  );
}
