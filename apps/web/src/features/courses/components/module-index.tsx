import {
  type CourseOutline,
  type LessonSection,
  ROUTES,
  type SectionKind,
} from '@siliconbox/shared';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format-duration';
import { isModuleDone, moduleMinutes, readableModules } from '../course-progress';
import { SiteLink } from '@/components/ui/site-link';

type OutlineLesson = CourseOutline['modules'][number]['lessons'][number];

type CourseProgressBarProps = { course: CourseOutline; doneLessonIds: ReadonlySet<string> };

/** "3 of 11 modules done", with a bar. */
function CourseProgressBar({ course, doneLessonIds }: CourseProgressBarProps) {
  const modules = readableModules(course);
  const done = modules.filter(({ module }) => isModuleDone(module, doneLessonIds)).length;
  if (modules.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {done} of {modules.length} modules done
      </p>
      <progress
        value={done}
        max={modules.length}
        aria-label="Course progress"
        className="h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-success [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-success"
      />
    </div>
  );
}

export type ModuleIndexProps = {
  course: CourseOutline;
  currentLessonId: string;
  doneLessonIds: ReadonlySet<string>;
  /** False when the learner may open only the free preview lessons. */
  fullAccess: boolean;
};

const KIND: Record<SectionKind, { label: string; tone: string }> = {
  theory: { label: 'Theory', tone: 'text-muted-foreground' },
  practice: { label: 'Practice', tone: 'text-foreground' },
  lab: { label: 'Lab', tone: 'font-semibold text-info' },
  project: { label: 'Project', tone: 'font-semibold text-info' },
};

const META = 'mt-0.5 flex gap-1.5 font-mono text-[10px] uppercase tracking-widest';

/** A link in a module's list: a title with a small line of facts under it. */
function PartLink({
  href,
  current,
  meta,
  children,
}: {
  href: string;
  current?: boolean;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SiteLink
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'block rounded px-2 py-1.5 text-[13px] leading-snug transition-colors hover:bg-muted',
        current && 'font-semibold',
      )}
    >
      {children}
      {meta && <span className={META}>{meta}</span>}
    </SiteLink>
  );
}

/** "Lab · Tool · 50 min": what the part is, whether the practice tool is in it, how long. */
function SectionMeta({ kind, hasDrill, minutes }: LessonSection) {
  return (
    <>
      <span className={KIND[kind].tone}>{KIND[kind].label}</span>
      {hasDrill && <span className="text-info">· Tool</span>}
      {minutes && <span className="text-muted-foreground">· {formatDuration(minutes)}</span>}
    </>
  );
}

/** A lesson's start (named "Overview" when it is the module's only lesson), then its parts. */
function LessonParts({
  lesson,
  href,
  label,
  current,
}: {
  lesson: OutlineLesson;
  href: string;
  label: string;
  current: boolean;
}) {
  return (
    <>
      <li>
        <PartLink href={href} current={current}>
          {label}
        </PartLink>
      </li>
      {(lesson.sections ?? []).map((section) => (
        <li key={section.anchor}>
          <PartLink href={`${href}#${section.anchor}`} meta={<SectionMeta {...section} />}>
            {section.title}
          </PartLink>
        </li>
      ))}
    </>
  );
}

function DoneMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px]',
        done ? 'border-success bg-success text-background' : 'border-muted-foreground/40',
      )}
    >
      {done && '✓'}
    </span>
  );
}

type ModuleState = { done: boolean; locked: boolean; minutes: number };

/** The module's heading row: done mark, number and title, time (or locked), fold arrow. */
function ModuleSummary({
  number,
  title,
  current,
  done,
  locked,
  minutes,
}: ModuleState & {
  number: number;
  title: string;
  current: boolean;
}) {
  return (
    <summary
      className={cn(
        'flex cursor-pointer list-none items-start gap-3 rounded px-3 py-2 text-[13px] leading-snug hover:bg-muted [&::-webkit-details-marker]:hidden',
        current && 'bg-muted font-semibold',
      )}
    >
      <DoneMark done={done} />
      <span className="flex-1">
        <span className="block font-mono text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
          Module {number}
        </span>
        {title}
        <span className="sr-only">
          {done && ' (done)'}
          {locked && ' (locked)'}
        </span>
      </span>
      {locked ? (
        <Badge aria-hidden="true">Locked</Badge>
      ) : (
        minutes > 0 && (
          <span className="mt-0.5 shrink-0 font-mono text-[11px] font-normal text-muted-foreground">
            {formatDuration(minutes)}
          </span>
        )
      )}
      <span
        aria-hidden="true"
        className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-90"
      >
        ›
      </span>
    </summary>
  );
}

type ModuleEntryProps = ReturnType<typeof readableModules>[number] &
  Omit<ModuleIndexProps, 'course'> & { courseSlug: string };

/** A module that folds out to its parts; the learner's current module starts open. */
function ModuleEntry({
  module,
  number,
  courseSlug,
  currentLessonId,
  doneLessonIds,
  fullAccess,
}: ModuleEntryProps) {
  const current = module.lessons.some((lesson) => lesson.publicId === currentLessonId);
  return (
    <li>
      <details open={current} className="group">
        <ModuleSummary
          number={number}
          title={module.title}
          current={current}
          done={isModuleDone(module, doneLessonIds)}
          locked={!fullAccess && !module.lessons.some((lesson) => lesson.preview)}
          minutes={moduleMinutes(module)}
        />
        <ol className="mb-2 ml-5 border-l border-border pl-2">
          {module.lessons.map((lesson) => (
            <LessonParts
              key={lesson.publicId}
              lesson={lesson}
              href={ROUTES.lesson(courseSlug, lesson.slug)}
              label={module.lessons.length === 1 ? 'Overview' : lesson.title}
              current={lesson.publicId === currentLessonId}
            />
          ))}
        </ol>
      </details>
    </li>
  );
}

/** Every module of the course and its parts: theory, labs and practice, with times and marks. */
export function ModuleIndex({ course, ...state }: ModuleIndexProps) {
  return (
    <nav aria-label="Course modules" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-3">
        <SiteLink
          href={ROUTES.course(course.slug)}
          className="text-sm font-semibold tracking-tight hover:underline"
        >
          {course.title}
        </SiteLink>
        <CourseProgressBar course={course} doneLessonIds={state.doneLessonIds} />
      </div>
      <ol className="flex flex-col gap-0.5">
        {readableModules(course).map((readable) => (
          <ModuleEntry
            key={readable.first.publicId}
            {...readable}
            {...state}
            courseSlug={course.slug}
          />
        ))}
      </ol>
    </nav>
  );
}
