import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/solver/**',
      'apps/web/migrations/**',
      'apps/web/migrate-mongo-config.js',
      'apps/web/src/cms/payload-types.ts',
      'apps/web/src/app/(payload)/admin/importMap.js',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // docs/engineering/coding-standards.md: small units, no stray logging, no unused code.
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
      'no-duplicate-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `onChange={(e) => set(e.target.value)}` is the normal React handler shape.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { next: { rootDir: 'apps/web' } },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      // Golden rule (ADR 0027): links never prefetch, so only SiteLink may use next/link.
      'no-restricted-imports': [
        'error',
        {
          name: 'next/link',
          message: 'Use SiteLink (@/components/ui/site-link): it never prefetches.',
        },
      ],
      // React calls whatever an effect returns as its cleanup. A call's value is not one:
      // scrollIntoView returns a Promise in current Chromium, and that crashed the page.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^use(Layout|Insertion)?Effect$/] > ArrowFunctionExpression > :matches(CallExpression, ChainExpression, AssignmentExpression, AwaitExpression).body',
          message: 'Give the effect a block body: an expression body becomes its cleanup.',
        },
      ],
    },
  },
  {
    files: ['apps/web/src/components/ui/site-link.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // k6 load tests run in k6's own runtime, which provides these.
    files: ['apps/web/loadtest/*.js'],
    languageOptions: { globals: { __ENV: 'readonly', __VU: 'readonly' } },
  },
  {
    // mongosh and plain Node scripts: CommonJS `require` is how they load files.
    files: ['infra/mongodb/*.{js,cjs}'],
    languageOptions: { globals: { ...globals.commonjs, db: 'readonly', print: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
