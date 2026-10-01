import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { buildConfig } from 'payload';
import { AccessGrants } from './cms/collections/access-grants';
import { Admins } from './cms/collections/admins';
import { Answers } from './cms/collections/answers';
import { Companies } from './cms/collections/companies';
import { Courses } from './cms/collections/courses';
import { DrillPrivate } from './cms/collections/drill-private';
import { Drills } from './cms/collections/drills';
import { Lessons } from './cms/collections/lessons';
import { Modules } from './cms/collections/modules';
import { Questions } from './cms/collections/questions';
import { SecurityAlerts } from './cms/collections/security-alerts';
import { Services } from './cms/collections/services';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Payload needs these when it starts; getPayload() fails fast if either is empty. */
function env(name: 'PAYLOAD_SECRET' | 'MONGODB_URI_ADMIN'): string {
  return process.env[name] ?? '';
}

export default buildConfig({
  secret: env('PAYLOAD_SECRET'),
  // The admin database user: the CMS writes content. Learner requests never go through Payload's API.
  // ensureIndexes: unique slugs and public ids exist before the CMS serves any request.
  db: mongooseAdapter({ url: env('MONGODB_URI_ADMIN'), ensureIndexes: true }),
  admin: {
    user: 'admins',
    theme: 'light',
    meta: { titleSuffix: ' · SiliconBox admin' },
    importMap: { baseDir: dirname },
  },
  // Payload's REST API lives apart from the gated /api/v1 and /api/auth routes.
  routes: { admin: '/admin', api: '/cms-api', graphQL: '/cms-api/graphql' },
  graphQL: { disable: true },
  collections: [
    Admins,
    Courses,
    Modules,
    Lessons,
    Drills,
    DrillPrivate,
    Companies,
    Questions,
    Answers,
    Services,
    AccessGrants,
    SecurityAlerts,
  ],
  typescript: { outputFile: path.resolve(dirname, 'cms/payload-types.ts') },
  // Cookie-authenticated CMS calls are accepted only from our own origin.
  csrf:
    process.env.BETTER_AUTH_URL === undefined ? [] : [new URL(process.env.BETTER_AUTH_URL).origin],
  telemetry: false,
});
