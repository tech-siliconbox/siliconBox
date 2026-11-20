// Run with `payload run loadtest/seed-praman.ts`: makes LOAD_LEARNERS invented learners
// (loadtest-<n>@example.test, password LOAD_PASSWORD) with a Basic plan and a tool window, for
// the Praman load test (loadtest/praman-sessions.js). Grants go through Payload as a seeded
// Support admin, so they are audited exactly as in the admin screen. A local database only:
// load tests never write to Atlas.
import { getPayload } from 'payload';
import config from '../src/payload.config';
import { getAuth } from '../src/server/auth/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL = /^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/;

const count = Number(process.env.LOAD_LEARNERS ?? '4');
const password = process.env.LOAD_PASSWORD ?? '';
if (!LOCAL.test(process.env.MONGODB_URI_ADMIN ?? '')) {
  throw new Error('The load test seeds a local database only (MONGODB_URI_ADMIN).');
}
if (password.length < 12) throw new Error('Set LOAD_PASSWORD (12 characters or more).');
if (!Number.isInteger(count) || count < 1 || count > 50) {
  throw new Error('LOAD_LEARNERS is a whole number from 1 to 50.');
}

const SUPPORT = 'loadtest-support@example.test';
const payload = await getPayload({ config });
// A second run reuses the Support admin of the first.
const existing = await payload.find({
  collection: 'admins',
  where: { email: { equals: SUPPORT } },
  limit: 1,
  overrideAccess: true,
});
const support =
  existing.docs[0] ??
  (await payload.create({
    collection: 'admins',
    data: { email: SUPPORT, password, role: 'support' },
    overrideAccess: true,
  }));
const startsAt = new Date(Date.now() - 60_000).toISOString();
const endsAt = new Date(Date.now() + DAY_MS).toISOString();

for (let n = 1; n <= count; n += 1) {
  const email = `loadtest-${n}@example.test`;
  await getAuth().api.signUpEmail({ body: { email, password, name: `Load Test ${n}` } });
  for (const kind of ['content', 'tool'] as const) {
    await payload.create({
      collection: 'access-grants',
      user: { ...support, collection: 'admins' },
      overrideAccess: true,
      data: {
        learnerEmail: email,
        kind,
        ...(kind === 'content' ? { level: 'basic' as const } : {}),
        startsAt,
        endsAt,
        reason: 'Load test grant (invented learner)',
      },
    });
  }
}
process.stdout.write(`Seeded ${count} load-test learners with a Basic plan and a tool window.\n`);
process.exit(0);
