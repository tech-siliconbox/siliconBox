# Contributing

## Flow

1. Pick a task from the current phase in `docs/roadmap/`.
2. Branch: `feat/<area>-<short-name>`, `fix/...`, `docs/...`.
3. Make the change with its tests. Run `pnpm typecheck && pnpm lint && pnpm test`.
4. Touching entitlements, pricing, sessions or any route? Also run `pnpm test:entitlements` and the security review command (`/review-security`).
5. Open a pull request using the template. One topic per PR.

## Commit messages

Conventional style: `feat: add drill run quota`, `fix: reject unknown fields on checkout`, `docs: add ADR 0012`.

## Definition of done

- Types, lint and tests pass; `pnpm dedupe:check` and `pnpm unused:check` are clean once set up.
- Reviewed with `/review-code`: no duplication, no dead code, shared pieces reused, single source of truth kept.
- New routes pass the four gates (authenticate, authorise, validate, rate-limit) and have a test for each.
- No secret, real user data or premium content in the diff, logs or fixtures.
- Docs and the changelog are updated when behaviour changes.
- A new decision that is hard to reverse has an ADR.

## Code standard

Write like a senior engineer: clean code, reusable components, no redundant code. See `docs/engineering/coding-standards.md` and `docs/engineering/code-review-checklist.md`.

## Language

Call the exercise unit a **Drill**. The old term is banned in code, UI, docs and data. See `docs/product/glossary.md`.
