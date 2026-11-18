import { ASSESSMENT_ATTEMPTS, ROUTES, assessmentAnchor, capstoneAnchor } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/shared/empty-state';
import { PageIntro } from '@/components/shared/page-intro';
import { SiteLink } from '@/components/ui/site-link';
import { Panel } from '@/features/dashboard/components/panel';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format-date';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readPerformance } from '@/server/performance';

export const metadata: Metadata = { title: 'Performance', robots: { index: false, follow: false } };

type Course = Awaited<ReturnType<typeof readPerformance>>[number];
type Line = { label: string; title: string; text: string; ok: boolean; href: string | null };

const pageOf = (course: Course, lessonSlug: string | null | undefined, anchor: string) =>
  lessonSlug ? `${ROUTES.lesson(course.courseSlug, lessonSlug)}#${anchor}` : null;

function assessmentLine(course: Course): Line | null {
  const work = course.assessment;
  if (work === null) return null;
  const { best, passed, attemptsLeft } = work.standing;
  const text = passed
    ? `Passed: ${best} of ${work.total}`
    : best === null
      ? `Not started. Pass with ${work.passMark} of ${work.total}.`
      : `Best ${best} of ${work.total}; ${attemptsLeft} of ${ASSESSMENT_ATTEMPTS} attempts left.`;
  const href = pageOf(course, work.lessonSlug, assessmentAnchor(work.slug));
  return { label: 'Assessment', title: work.title, text, ok: passed, href };
}

function capstoneLine(course: Course): Line | null {
  const work = course.capstone;
  if (work === null) return null;
  const grade = work.latest?.grade;
  const text = work.passed
    ? `Passed: ${grade?.total ?? ''} of ${work.total}`
    : work.latest === null
      ? `Not submitted. Pass with ${work.passMark} of ${work.total}.`
      : grade == null
        ? `Sent ${formatDate(work.latest.submittedAt)}; waiting for an expert's review.`
        : `${grade.total} of ${work.total}: not passed yet. Read the feedback and send a new version.`;
  const href = pageOf(course, work.lessonSlug, capstoneAnchor(work.slug));
  return { label: 'Capstone project', title: work.title, text, ok: work.passed, href };
}

function CourseResult({ course }: { course: Course }) {
  const lines = [assessmentLine(course), capstoneLine(course)].filter((line) => line !== null);
  return (
    <Panel title={course.courseTitle} count={course.passed ? 'Course passed' : 'In progress'}>
      <ul className="divide-y divide-border">
        {lines.map(({ label, title, text, ok, href }) => (
          <li key={label} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-muted-foreground">{label}</span>
              <span className="font-medium">{title}</span>
              <span className={cn('text-sm', ok ? 'text-ok' : 'text-muted-foreground')}>
                {text}
              </span>
            </div>
            {href !== null && (
              <SiteLink href={href} className="text-sm underline underline-offset-4">
                Open
              </SiteLink>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default async function PerformancePage() {
  const courses = await readPerformance(await requirePageIdentity());
  return (
    <div className="flex flex-col gap-6">
      <PageIntro eyebrow="Performance" title="Your results">
        Each course&apos;s assessment and capstone project. You pass a course when both pass.
      </PageIntro>
      {courses.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          description="Results appear here once a course has its assessment and capstone."
        />
      ) : (
        courses.map((course) => <CourseResult key={course.courseSlug} course={course} />)
      )}
    </div>
  );
}
