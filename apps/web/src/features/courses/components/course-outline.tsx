import { type CourseOutline, LEVEL_LABELS, ROUTES } from '@siliconbox/shared';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/lib/format-duration';
import { SiteLink } from '@/components/ui/site-link';

type OutlineModule = CourseOutline['modules'][number];
type OutlineLesson = OutlineModule['lessons'][number];

const ROW = 'flex items-center gap-3 px-5 py-3.5';

function LessonRow({ href, lesson, done }: { href: string; lesson: OutlineLesson; done: boolean }) {
  return (
    <li className={ROW}>
      <span aria-hidden="true" className="w-4 font-mono text-[12px]">
        {done ? '✓' : ''}
      </span>
      <SiteLink
        aria-label={done ? `${lesson.title} (done)` : undefined}
        href={href}
        className="flex-1 text-[13px] hover:underline"
      >
        {lesson.title}
      </SiteLink>
      {lesson.preview && <Badge>Free preview</Badge>}
      {lesson.durationMinutes && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatDuration(lesson.durationMinutes)}
        </span>
      )}
    </li>
  );
}

function DrillRow({ href, drill }: { href: string; drill: OutlineModule['drills'][number] }) {
  return (
    <li className={ROW}>
      <span aria-hidden="true" className="w-4" />
      <SiteLink href={href} className="flex-1 text-[13px] hover:underline">
        {drill.title}
      </SiteLink>
      <Badge variant="muted">Drill</Badge>
    </li>
  );
}

type CourseOutlineViewProps = { course: CourseOutline; doneLessonIds: ReadonlySet<string> };

/** A course's modules with lesson and Drill titles. Both open only after sign-in and entitlement. */
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
              <LessonRow
                key={lesson.publicId}
                href={ROUTES.lesson(course.slug, lesson.slug)}
                lesson={lesson}
                done={doneLessonIds.has(lesson.publicId)}
              />
            ))}
            {module.drills.map((drill) => (
              <DrillRow
                key={drill.slug}
                href={ROUTES.drill(course.slug, drill.slug)}
                drill={drill}
              />
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
