// Turns roles.json into MongoDB privileges: [{ collection, actions }] per role.
const ACTIONS = {
  // listIndexes reads index definitions only: Better Auth checks its indexes exist at start-up.
  readWrite: ['find', 'insert', 'update', 'remove', 'listIndexes'],
  insertOnly: ['insert'],
  findInsert: ['find', 'insert'],
  readOnly: ['find'],
};

function privilegesFor(role) {
  return Object.entries(role).flatMap(([kind, collections]) =>
    collections.map((collection) => ({ collection, actions: ACTIONS[kind] })),
  );
}

module.exports = { privilegesFor };
