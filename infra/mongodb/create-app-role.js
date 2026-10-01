// mongosh script: creates the least-privilege role for the learner-facing app user.
// Usage: mongosh "$MONGODB_URI_ADMIN" --file infra/mongodb/create-app-role.js
// On Atlas, create the same custom role in the UI or Admin API with these privileges.
//
// Deliberately absent: drill_private and answers (hidden material), the migration
// collections, and update/remove on audit_log (append-only).

const ROLE = 'siliconboxApp';
const READ_WRITE = ['find', 'insert', 'update', 'remove'];

const dbName = db.getName();
const readWrite = [
  'users',
  'sessions',
  'accounts',
  'verifications',
  'twoFactors',
  'entitlements',
  'orders',
  'progress',
  'runs',
  'ended_sessions',
  'watermark_codes',
].map((collection) => ({ resource: { db: dbName, collection }, actions: READ_WRITE }));
const appendOnly = [
  { resource: { db: dbName, collection: 'audit_log' }, actions: ['find', 'insert'] },
];
// Content is written by the CMS (admin user); the site only reads published documents.
const readOnly = ['courses', 'modules', 'lessons', 'questions', 'companies'].map((collection) => ({
  resource: { db: dbName, collection },
  actions: ['find'],
}));
const privileges = [...readWrite, ...appendOnly, ...readOnly];

if (db.getRole(ROLE) === null) {
  db.createRole({ role: ROLE, privileges, roles: [] });
  print(`created role ${ROLE}`);
} else {
  db.updateRole(ROLE, { privileges, roles: [] });
  print(`updated role ${ROLE}`);
}
