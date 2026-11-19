import 'server-only';
import { assessmentStanding } from '@siliconbox/shared';
import { findAllAttempts } from '@/db/assessment-attempts';
import { findAllSubmissions } from '@/db/capstone-submissions';
import { type CourseWorkRow, findCourseWorkList } from '@/db/content';
import type { Identity } from './auth/authenticate';

type CourseResult = {
  courseSlug: string;
  courseTitle: string;
  assessment: (CourseWorkRow & { standing: ReturnType<typeof assessmentStanding> }) | null;
  capstone:
    | (CourseWorkRow & {
        latest: Awaited<ReturnType<typeof findAllSubmissions>>[number] | null;
        passed: boolean;
      })
    | null;
};

/** Each course's assessment and capstone with where the learner stands; passed when both pass. */
export async function readPerformance(identity: Identity) {
  const [assessments, capstones, attempts, submissions] = await Promise.all([
    findCourseWorkList('assessments'),
    findCourseWorkList('capstones'),
    findAllAttempts(identity.userId),
    findAllSubmissions(identity.userId),
  ]);
  const courses = new Map<string, CourseResult>();
  const courseOf = (row: CourseWorkRow) => {
    const known = courses.get(row.courseSlug);
    if (known !== undefined) return known;
    const fresh: CourseResult = {
      courseSlug: row.courseSlug,
      courseTitle: row.courseTitle,
      assessment: null,
      capstone: null,
    };
    courses.set(row.courseSlug, fresh);
    return fresh;
  };
  for (const row of assessments) {
    const tried = attempts.find((record) => record.assessmentId === row.publicId)?.attempts ?? [];
    courseOf(row).assessment = { ...row, standing: assessmentStanding(tried, row.passMark) };
  }
  for (const row of capstones) {
    const mine = submissions.filter((submission) => submission.capstoneId === row.publicId);
    const passed = mine.some((submission) => submission.grade?.passed === true);
    courseOf(row).capstone = { ...row, latest: mine[0] ?? null, passed };
  }
  return [...courses.values()].map((course) => ({
    ...course,
    passed: course.assessment?.standing.passed === true && course.capstone?.passed === true,
  }));
}
