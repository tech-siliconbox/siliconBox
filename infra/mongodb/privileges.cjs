// Turns roles.json into MongoDB privileges: [{ collection, actions }] per role.
const ACTIONS = {
  readWrite: ['find', 'insert', 'update', 'remove'],
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
