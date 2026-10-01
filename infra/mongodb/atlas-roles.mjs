// Creates or updates the custom roles from roles.json on Atlas, through the Atlas CLI.
// Usage: node infra/mongodb/atlas-roles.mjs <projectId>   (after `atlas auth login`)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { privilegesFor } = require('./privileges.cjs');
const { database, roles } = JSON.parse(
  readFileSync(new URL('./roles.json', import.meta.url), 'utf8'),
);

const projectId = process.argv[2];
if (!projectId) throw new Error('Usage: node infra/mongodb/atlas-roles.mjs <projectId>');

const existing = execFileSync(
  'atlas',
  ['customDbRoles', 'list', '--projectId', projectId, '-o', 'json'],
  { encoding: 'utf8' },
);
const existingNames = new Set((JSON.parse(existing || '[]') ?? []).map((role) => role.roleName));

for (const [name, role] of Object.entries(roles)) {
  const privilege = privilegesFor(role)
    .flatMap(({ collection, actions }) =>
      actions.map((action) => `${action.toUpperCase()}@${database}.${collection}`),
    )
    .join(',');
  const verb = existingNames.has(name) ? 'update' : 'create';
  execFileSync(
    'atlas',
    ['customDbRoles', verb, name, '--privilege', privilege, '--projectId', projectId],
    { stdio: 'inherit' },
  );
}
