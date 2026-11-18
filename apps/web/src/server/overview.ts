import 'server-only';
import { contentStatus } from '@siliconbox/shared';
import { findCourseOutlines } from '@/db/content';
import { findEntitlements } from '@/db/entitlements';
import type { Identity } from './auth/authenticate';
import { readActivity } from './activity';
import { readProfile } from './profile';

/** What the learner's Overview shows: their profile, each course with their access, their activity. */
export async function readOverview(identity: Identity, now: Date = new Date()) {
  const [courses, entitlements, events, profile] = await Promise.all([
    findCourseOutlines(),
    findEntitlements(identity.userId),
    readActivity(identity.userId),
    readProfile(identity.userId),
  ]);
  return {
    profile,
    courses: courses.map((course) => ({
      course,
      access: contentStatus(entitlements, course.level, now),
    })),
    events,
  };
}
