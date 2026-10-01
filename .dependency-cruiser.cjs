/**
 * Enforces the layering in docs/engineering/coding-standards.md:
 * shared <- db <- server <- features/components <- app. Pages stay thin.
 */
const WEB = '^apps/web/src/';

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'shared-is-standalone',
      comment: 'packages/shared holds pure rules and imports no app code.',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^apps/' },
    },
    {
      name: 'only-db-talks-to-mongodb',
      severity: 'error',
      from: { path: WEB, pathNot: [`${WEB}db/`, `${WEB}server/auth/auth\\.ts$`] },
      to: { path: 'node_modules/mongodb/' },
    },
    {
      name: 'db-does-not-import-upper-layers',
      severity: 'error',
      from: { path: `${WEB}db/` },
      to: { path: `${WEB}(app|components|features|hooks)/` },
    },
    {
      name: 'ui-primitives-stay-presentational',
      severity: 'error',
      from: { path: `${WEB}components/ui/` },
      to: { path: `${WEB}(server|db|features|app)/` },
    },
    {
      name: 'client-code-never-imports-server',
      comment: 'Hooks and client helpers must not pull server modules into the browser bundle.',
      severity: 'error',
      from: { path: `${WEB}(hooks|lib)/` },
      to: { path: `${WEB}(server|db)/` },
    },
    {
      name: 'features-do-not-import-each-other',
      severity: 'error',
      from: { path: `${WEB}features/([^/]+)/` },
      to: { path: `${WEB}features/`, pathNot: `${WEB}features/$1/` },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.tsx?$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
