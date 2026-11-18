import { LEVEL_LABELS, ROUTES, currentStreak, slugify } from '@siliconbox/shared';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PageIntro } from '@/components/shared/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SiteLink } from '@/components/ui/site-link';
import { CourseProgressBar } from '@/features/courses/components/course-progress-bar';
import {
  isModuleDone,
  modulesDone,
  nextLesson,
  readableModules,
} from '@/features/courses/course-progress';
import { outlineLinks } from '@/features/dashboard/outline-links';
import { windowText } from '@/features/dashboard/window-text';
import { cn } from '@/lib/cn';
import { formatTimeAgo } from '@/lib/format-date';
import { type ActivityEvent, activeDays, doneLessonIds, solvedDrillIds } from '@/server/activity';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readOverview } from '@/server/overview';

export const metadata: Metadata = { title: 'Overview', robots: { index: false, follow: false } };

type Course = Awaited<ReturnType<typeof readOverview>>['courses'][number];
type Done = ReadonlySet<string>;
const EYEBROW = 'font-mono text-[11px] uppercase tracking-widest text-muted-foreground';
const RECENT = 5;

/** A bordered list: a heading row (with an optional count on the right), then its rows. */
function Panel({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  const id = `panel-${slugify(title)}`;
  return (
    <section aria-labelledby={id} className="rounded-card border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 id={id} className={EYEBROW}>
          {title}
        </h2>
        {count !== undefined && <span className={EYEBROW}>{count}</span>}
      </div>
      {children}
    </section>
  );
}

function StatTiles({ tiles }: { tiles: { label: string; value: number; of?: number }[] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
      {tiles.map(({ label, value, of }) => (
        <div key={label} className="flex flex-col gap-2 bg-background px-5 py-4">
          <dt className={EYEBROW}>{label}</dt>
          <dd className="font-mono text-2xl font-semibold">
            {value}
            {of !== undefined && (
              <span className="text-sm font-normal text-muted-foreground"> / {of}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The next lesson to read: in the first course with one the learner may open. */
function ContinueCard({ courses, done }: { courses: Course[]; done: Done }) {
  const target = courses
    .map(({ course, access }) => ({
      course,
      next: nextLesson(course, done, (lesson) => access.state === 'active' || lesson.preview),
    }))
    .find(({ next }) => next !== null);
  if (target?.next == null) return null;
  const { course, next } = target;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 bg-muted">
      <div className="flex flex-col gap-1">
        <p className={EYEBROW}>
          Continue · {LEVEL_LABELS[course.level]} · Module {next.number}
        </p>
        <p className="text-lg font-semibold">{next.moduleTitle}</p>
      </div>
      <SiteLink href={ROUTES.lesson(course.slug, next.lesson.slug)} className={buttonVariants()}>
        Continue →
      </SiteLink>
    </Card>
  );
}

function CourseList({ courses, done }: { courses: Course[]; done: Done }) {
  return (
    <Panel title="Your courses">
      <ul className="divide-y divide-border">
        {courses.map(({ course, access }) => (
          <li key={course.slug} className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SiteLink href={ROUTES.course(course.slug)} className="font-semibold hover:underline">
                {course.title}
              </SiteLink>
              <span className="text-[12px] text-muted-foreground">
                {windowText(access, 'Module 1 free · buy to open the rest')}
              </span>
            </div>
            <CourseProgressBar course={course} doneLessonIds={done} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type Step = { label: string; done: boolean; href: string };

/** The first three things to do, checked off as they happen. */
function GettingStarted({ steps }: { steps: Step[] }) {
  const finished = steps.filter((step) => step.done).length;
  return (
    <Panel title="Getting started" count={`${finished} of ${steps.length}`}>
      <ul className="divide-y divide-border">
        {steps.map(({ label, done, href }) => (
          <li key={label} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded border text-[10px]',
                done ? 'border-success bg-success text-background' : 'border-muted-foreground/40',
              )}
            >
              {done && '✓'}
            </span>
            {done ? (
              <span className="text-muted-foreground line-through">{label}</span>
            ) : (
              <SiteLink href={href} className="hover:underline">
                {label}
              </SiteLink>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const RUN_WORD = { true: 'Solved', false: 'Tried', null: 'Checking' } as const;

function RecentActivity({
  events,
  courses,
  now,
}: {
  events: ActivityEvent[];
  courses: Course[];
  now: Date;
}) {
  const links = outlineLinks(courses.map(({ course }) => course));
  const rows = events.slice(0, RECENT).flatMap((event) => {
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

/** The first module and Drill of the first course, for the getting-started steps. */
function firstSteps(course: Course['course'] | undefined, done: Done) {
  const [firstModule] = course === undefined ? [] : readableModules(course);
  const firstDrill = course?.modules.flatMap((module) => module.drills)[0];
  const home = course === undefined ? ROUTES.courses : ROUTES.course(course.slug);
  return {
    moduleDone: firstModule !== undefined && isModuleDone(firstModule.module, done),
    moduleHref: course && firstModule ? ROUTES.lesson(course.slug, firstModule.first.slug) : home,
    drillHref: course && firstDrill ? ROUTES.drill(course.slug, firstDrill.slug) : home,
  };
}

export default async function OverviewPage() {
  const identity = await requirePageIdentity();
  const now = new Date();
  const { courses, events } = await readOverview(identity, now);
  const done = doneLessonIds(events);
  const solved = solvedDrillIds(events);
  const outlines = courses.map(({ course }) => course);
  const modules = outlines.map((course) => modulesDone(course, done));
  const drills = outlines.flatMap((course) => course.modules.flatMap((module) => module.drills));
  const first = firstSteps(courses[0]?.course, done);
  const steps: Step[] = [
    { label: 'Verify your email', done: identity.emailVerified, href: ROUTES.settings },
    { label: 'Finish Module 1', done: first.moduleDone, href: first.moduleHref },
    { label: 'Solve your first Drill', done: solved.size > 0, href: first.drillHref },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageIntro eyebrow="Overview" title={`Welcome back, ${identity.name.split(' ')[0] ?? ''}`} />
      <StatTiles
        tiles={[
          {
            label: 'Modules done',
            value: modules.reduce((n, m) => n + m.done, 0),
            of: modules.reduce((n, m) => n + m.total, 0),
          },
          { label: 'Drills solved', value: solved.size, of: drills.length },
          { label: 'Day streak', value: currentStreak(activeDays(events), now) },
        ]}
      />
      <ContinueCard courses={courses} done={done} />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <CourseList courses={courses} done={done} />
        <div className="flex flex-col gap-6">
          <GettingStarted steps={steps} />
          <RecentActivity events={events} courses={courses} now={now} />
        </div>
      </div>
    </div>
  );
}
