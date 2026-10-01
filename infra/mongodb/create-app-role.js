// mongosh script for self-managed MongoDB (local or staging): creates the roles in roles.json.
// Usage: mongosh "$MONGODB_URI_ADMIN" --file infra/mongodb/create-app-role.js
// On Atlas use atlas-roles.mjs instead: Atlas does not allow createRole from a shell.

const path = require('path');
const { privilegesFor } = require(path.join(__dirname, 'privileges.cjs'));
const { roles } = JSON.parse(
  require('fs').readFileSync(path.join(__dirname, 'roles.json'), 'utf8'),
);

for (const [name, role] of Object.entries(roles)) {
  const privileges = privilegesFor(role).map(({ collection, actions }) => ({
    resource: { db: db.getName(), collection },
    actions,
  }));
  if (db.getRole(name) === null) db.createRole({ role: name, privileges, roles: [] });
  else db.updateRole(name, { privileges, roles: [] });
  print(`role ${name}: ${privileges.length} privileges`);
}
