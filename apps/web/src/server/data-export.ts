import 'server-only';
import { OPTION_LETTERS, outlineLinks } from '@siliconbox/shared';
import { findAllAttempts } from '@/db/assessment-attempts';
import { findAllSubmissions } from '@/db/capstone-submissions';
import { findSignIns } from '@/db/audit-log';
import { findCourseOutlines, findCourseWorkList } from '@/db/content';
import { findAllScreenings } from '@/db/cv-screenings';
import { findEntitlements } from '@/db/entitlements';
import { findPhoto, findProfile } from '@/db/profiles';
import { findCompletions } from '@/db/progress';
import { findAllResumes } from '@/db/resumes';
import { findRunOutcomes } from '@/db/runs';
import { readFiles } from '@/db/tool-files';
import { findAllToolRuns } from '@/db/tool-runs';
import { findAllToolSessions } from '@/db/tool-sessions';
import { getAuth } from './auth/auth';
import type { Identity } from './auth/authenticate';
import { runSolved } from './runs';

const SIGN_IN_METHODS: Readonly<Record<string, string>> = {
  credential: 'password',
  google: 'Google',
};

const NOT_INCLUDED =
  'Not included: your Drill code, which starts from our copyrighted starter files; watermark ' +
  'codes and security alerts, which protect your account and our content; your capstone files, ' +
  'which you uploaded and keep; your CV files, which you can download from CV screening; ' +
  "your Praman sessions' logs and waveform traces, which you can open on the tool page.";

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

/** The learner's assessment attempts and capstone submissions with their grades and feedback. */
async function courseWorkPart(userId: string) {
  const [assessments, capstones, attempts, submissions] = await Promise.all([
    findCourseWorkList('assessments'),
    findCourseWorkList('capstones'),
    findAllAttempts(userId),
    findAllSubmissions(userId),
  ]);
  const titles = new Map([...assessments, ...capstones].map((work) => [work.publicId, work.title]));
  return {
    assessmentAttempts: attempts.map((record) => ({
      assessment: titles.get(record.assessmentId) ?? record.assessmentId,
      attempts: record.attempts.map(({ score, at, answers }) => ({
        score,
        at,
        answers: answers.map((choice) => OPTION_LETTERS[choice]),
      })),
    })),
    // The grade without who gave it: their address is our staff's, not the learner's.
    capstoneSubmissions: submissions.map(({ capstoneId, fileName, size, submittedAt, grade }) => ({
      capstone: titles.get(capstoneId) ?? capstoneId,
      fileName,
      size,
      submittedAt,
      grade: grade && {
        scores: grade.scores,
        total: grade.total,
        passed: grade.passed,
        feedback: grade.feedback,
        gradedAt: grade.gradedAt,
      },
    })),
  };
}

/** The learner's Praman sessions (files and script) and runs with each property's result. */
async function pramanPart(userId: string) {
  const [sessions, runs] = await Promise.all([
    findAllToolSessions(userId),
    findAllToolRuns(userId),
  ]);
  const names = new Map(sessions.map((session) => [session.publicId, session.name]));
  return {
    pramanSessions: await Promise.all(
      sessions.map(async (session) => ({
        name: session.name,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        top: session.top,
        files: await readFiles(userId, session.files),
        script: session.journal,
      })),
    ),
    pramanRuns: runs.map((run) => ({
      session: names.get(run.sessionId) ?? run.sessionId,
      number: run.number,
      command: run.command,
      top: run.top,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      properties: run.properties,
    })),
  };
}

/** The learner's handle, bio and links, and their photo as a data address. */
async function profilePart(userId: string) {
  const [profile, photo] = await Promise.all([findProfile(userId), findPhoto(userId)]);
  const encoded = photo && `data:image/webp;base64,${Buffer.from(photo).toString('base64')}`;
  return { ...profile, photo: encoded };
}

/** Everything we hold about a learner, in plain fields, for the download in Settings (DPDP). */
export async function buildDataExport(identity: Identity, headers: Headers, now: Date) {
  const [account, profile, learning, courseWork, resumes, cvScreenings, praman] = await Promise.all(
    [
      accountPart(identity, headers),
      profilePart(identity.userId),
      learningPart(identity.userId),
      courseWorkPart(identity.userId),
      findAllResumes(identity.userId),
      findAllScreenings(identity.userId),
      pramanPart(identity.userId),
    ],
  );
  return {
    exportedAt: now,
    notIncluded: NOT_INCLUDED,
    ...account,
    profile,
    ...learning,
    ...courseWork,
    resumes,
    cvScreenings,
    ...praman,
  };
}
