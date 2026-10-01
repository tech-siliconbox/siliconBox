# Coding standards

How code is written in SiliconBox. The short version for Claude Code is `.claude/rules/code-quality.md`; this is the full reasoning and the tooling.

## Principles

1. **Reuse before you write.** Search the repo for an existing function, hook, component, schema or constant. Extend it if it is close.
2. **One source of truth.** Every rule, number, name and message lives in one place. Prices, level caps, window lengths, roles, route paths and error codes are defined once in `packages/shared`.
3. **No redundant code.** Duplicated logic is extracted on its second appearance. Dead code is deleted. Types are derived from schemas.
4. **Keep units small.** One function, one job; one component, one concern. Around 30 lines is a prompt to look for a split.
5. **Pure core, effects at the edge.** Pricing, entitlement and watermark rules are pure, take the clock as an argument and are tested against the matrix.
6. **Composition over configuration.** Build from small parts; avoid components with many boolean props.
7. **Make illegal states hard to represent.** Use unions and branded types (for example `Level`, `EntitlementKind`), not loose strings.
8. **Explicit errors.** Typed errors, one mapper from error to HTTP response, no swallowed errors.
9. **Do not over-abstract.** Abstract to remove real duplication or hide real complexity. No speculative generality.
10. **Leave it cleaner**, but keep a change to its topic. Unrelated cleanup goes in its own change.

## Layering (web app)

```
packages/shared            schemas, constants, pure rules (prices, entitlements), error codes
apps/web/src/server        auth, entitlement service, pricing, watermark, rate limit, audit, API wrapper
apps/web/src/db            client and repositories (only place that talks to MongoDB)
apps/web/src/hooks         reusable client hooks
apps/web/src/components/ui        design-system primitives
apps/web/src/components/shared    cross-feature components
apps/web/src/features/<name>      one feature: components, hooks, server actions
apps/web/src/app           routes and pages: thin, compose features
```

Rules: pages are thin. Routes call the shared API wrapper and a service. Services call repositories. Repositories are the only code that builds queries. Features do not import each other's internals.

## TypeScript

- `strict` on. No `any`; use `unknown` and narrow. No `@ts-ignore` without a one-line reason.
- `type X = z.infer<typeof XSchema>`; never restate a schema by hand.
- Prefer `const`, early returns and small helpers over nested branches.
- Use named exports. One exported component per file.
- No default values that hide missing config; fail fast on missing env variables with one validated config module.

## React

- Server components by default. Client components only for interaction.
- Data loading in server components or hooks, never inside primitives.
- Variants with one mechanism (cva). Tokens from the design system only.
- Extract repeated stateful logic into a hook.
- Accessibility belongs to the component: semantics, labels, focus, keyboard.

## API and data

- Every route uses the shared wrapper (authenticate, authorise, validate, rate-limit).
- Input and output shapes come from `packages/shared` schemas.
- Only repositories build MongoDB queries; never from raw request data.

## Python (solver)

Type hints, Pydantic models, thin routers, service functions, one config module, ruff and vulture. No copy of path or template code.

## Tests

- Test behaviour, not implementation. Co-locate unit tests.
- Pure rules get table-driven tests (the entitlement matrix).
- Mock only at process boundaries (Razorpay, solver, email), not inside our own modules.
- Fixtures are invented data.

## Tooling (set up in phase 1)

| Tool | Purpose | Script |
| --- | --- | --- |
| TypeScript strict | Type safety | `pnpm typecheck` |
| ESLint + Prettier | Style, bugs; rules on complexity, max function length, no duplicate imports, no unused vars, no `console` | `pnpm lint` |
| jscpd | Copy-paste detection with a failing threshold in CI | `pnpm dedupe:check` |
| knip | Unused files, exports and dependencies | `pnpm unused:check` |
| dependency-cruiser | Enforce the layering and forbid circular imports | `pnpm deps:check` |
| Vitest, Playwright | Tests | `pnpm test`, `pnpm test:e2e` |
| ruff, vulture, pytest | Python lint, dead code, tests | in `apps/solver` |

CI runs all of these. A change that adds duplication or dead code over the threshold fails.

## Workflow for each task

1. Read the task and the docs it links.
2. Search for existing code to reuse (`/find-duplicates <path>` helps).
3. Plan the smallest change; write tests with it.
4. Implement using the shared pieces.
5. Re-read your diff for duplication, repeated literals and dead code.
6. Run the checks. Run `/review-code`.
7. Update `docs/engineering/component-catalog.md` and other docs if you added a shared piece.
