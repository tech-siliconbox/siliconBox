import 'server-only';
import { contentStatus } from '@siliconbox/shared';
import { findCourseOutlines } from '@/db/content';
import { findEntitlements } from '@/db/entitlements';
import type { Identity } from './auth/authenticate';
import { readActivity } from './activity';

/** What the learner's Overview shows: each course with their access to it, and their activity. */
export async function readOverview(identity: Identity, now: Date = new Date()) {
  const [courses, entitlements, events] = await Promise.all([
    findCourseOutlines(),
    findEntitlements(identity.userId),
    readActivity(identity.userId),
  ]);
  return {
    courses: courses.map((course) => ({
      course,
      access: contentStatus(entitlements, course.level, now),
    })),
    events,
  };
}
