import 'server-only';
import { outlineLinks } from '@siliconbox/shared';
import { findSignIns } from '@/db/audit-log';
import { findCourseOutlines } from '@/db/content';
import { findAllScreenings } from '@/db/cv-screenings';
import { findEntitlements } from '@/db/entitlements';
import { findCompletions } from '@/db/progress';
import { findResume } from '@/db/resumes';
import { findRunOutcomes } from '@/db/runs';
import { getAuth } from './auth/auth';
import type { Identity } from './auth/authenticate';
import { runSolved } from './runs';

const SIGN_IN_METHODS: Readonly<Record<string, string>> = {
  credential: 'password',
  google: 'Google',
};

const NOT_INCLUDED =
  'Not included: your Drill code, which starts from our copyrighted starter files; watermark ' +
  'codes and security alerts, which protect your account and our content.';

/** Who the learner is, how they sign in, the device signed in now, and past sign-ins. */
async function accountPart(identity: Identity, headers: Headers) {
  const auth = getAuth().api;
  const [session, methods, sessions, signIns] = await Promise.all([
    auth.getSession({ headers }),
    auth.listUserAccounts({ headers }),
    auth.listSessions({ headers }),
    findSignIns(identity.userId),
  ]);
  return {
    account: {
      name: identity.name,
      email: identity.email,
      emailVerified: identity.emailVerified,
      createdAt: session?.user.createdAt ?? null,
      signInMethods: methods.map(
        (method) => SIGN_IN_METHODS[method.providerId] ?? method.providerId,
      ),
    },
    // Chosen fields only: a session's token must never leave the server.
    devices: sessions.map((device) => ({
      signedInAt: device.createdAt,
      ipAddress: device.ipAddress ?? null,
      browser: device.userAgent ?? null,
    })),
    signIns,
  };
}

/** What the learner may open, the lessons they finished and the Drills they ran. */
async function learningPart(userId: string) {
  const [courses, entitlements, completions, runs] = await Promise.all([
    findCourseOutlines(),
    findEntitlements(userId),
    findCompletions(userId),
    findRunOutcomes(userId),
  ]);
  const links = outlineLinks(courses);
  return {
    access: entitlements.map(({ kind, startsAt, endsAt, source, ...held }) => ({
      kind,
      level: 'level' in held ? held.level : null,
      startsAt,
      endsAt,
      source,
    })),
    lessonsFinished: completions.map((done) => ({
      lesson: links.lessons.get(done.lessonId)?.title ?? done.lessonId,
      finishedAt: done.completedAt,
    })),
    // `solved` is null while a run is still being checked.
    drillRuns: runs.map((run) => ({
      drill: links.drills.get(run.drillId)?.title ?? run.drillId,
      ranAt: run.createdAt,
      solved: runSolved(run),
    })),
  };
}

/** Everything we hold about a learner, in plain fields, for the download in Settings (DPDP). */
export async function buildDataExport(identity: Identity, headers: Headers, now: Date) {
  const [account, learning, resume, cvScreenings] = await Promise.all([
    accountPart(identity, headers),
    learningPart(identity.userId),
    findResume(identity.userId),
    findAllScreenings(identity.userId),
  ]);
  return {
    exportedAt: now,
    notIncluded: NOT_INCLUDED,
    ...account,
    ...learning,
    resume,
    cvScreenings,
  };
}
