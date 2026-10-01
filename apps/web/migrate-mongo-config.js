import { existsSync } from 'node:fs';

// Locally, read apps/web/.env.local; in CI the variables come from the environment.
const localEnv = new URL('.env.local', import.meta.url);
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

// Migrations run with the admin database user; the app user cannot create indexes.
const url = process.env.MONGODB_URI_ADMIN;
if (!url) throw new Error('MONGODB_URI_ADMIN is required to run migrations');

export default {
  mongodb: { url },
  migrationsDir: 'migrations',
  changelogCollectionName: 'migrations_changelog',
  lockCollectionName: 'migrations_lock',
  lockTtl: 300,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm',
};
