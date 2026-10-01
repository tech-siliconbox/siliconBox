// Run with `payload run`: creates one CMS admin for the end-to-end tests through Payload itself,
// so passwords are hashed and access hooks run exactly as in the admin UI.
import { AdminRoleSchema } from '@siliconbox/shared';
import { getPayload } from 'payload';
import config from '../../src/payload.config';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const role = AdminRoleSchema.parse(process.env.E2E_ADMIN_ROLE);
if (!email.endsWith('@example.test'))
  throw new Error('Test admins must use an @example.test address');

const payload = await getPayload({ config });
await payload.create({
  collection: 'admins',
  data: { email, password, role },
  overrideAccess: true,
});
process.exit(0);
