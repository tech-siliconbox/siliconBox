---
description: Senior-engineer code standard. Applies to all code written in this repo
---

# Code quality: write like a senior engineer

The goal is clean, readable code with reusable parts and no redundancy. Follow this on every task.

## Before writing code

1. **Search first.** Grep for an existing function, hook, component, schema, constant or route wrapper that already does the job. Check `docs/engineering/component-catalog.md` and `packages/shared`. Reuse or extend it; do not write a second copy.
2. **Plan small.** Name the smallest change that solves the task. Do not build for needs nobody has stated.

## While writing

- **One source of truth.** A price, cap, window length, role name, route path or error message is defined once (in `packages/shared` or one module) and imported everywhere. No magic numbers or repeated string literals.
- **Derive, do not repeat.** Types come from Zod (`z.infer`). Do not hand-write a type that mirrors a schema.
- **Extract on the second copy.** If the same logic or markup appears a second time, extract it into a function, hook or component in the right shared place. Do not copy and tweak.
- **But do not over-abstract.** No speculative options, flags or layers. An abstraction must remove real duplication or hide real complexity today.
- **Small units.** A function does one thing, about 30 lines or fewer. A component renders one concern. Split when a function needs "and" in its name.
- **Pure core, effects at the edges.** Business rules (pricing, entitlements, watermark generation) are pure functions with the clock and inputs passed in. I/O sits in thin wrappers.
- **Composition over configuration.** Prefer small components that compose to a component with many boolean props.
- **Strict types.** TypeScript strict. No `any`, no unchecked casts, no `@ts-ignore` without a one-line reason. Python code has type hints and Pydantic models.
- **Clear names.** Say what it is or does (`assertEntitled`, `buildLessonResponse`), not how (`handleData`, `doStuff`). One naming style per kind. Use the word Drill.
- **Errors.** Use typed, shared error classes and one error-to-response mapper. Do not swallow errors or return `null` to mean "failed".
- **Comments explain why, not what.** No commented-out code. No TODO without a linked task.
- **No dead code.** Remove unused imports, exports, parameters, files and feature flags you touch. Do not leave `console.log` or debug code.

## After writing

1. Re-read your own diff as a reviewer. Look for duplicated blocks, near-identical components, repeated literals and unused code. Fix them.
2. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`. Once set up, also run `pnpm dedupe:check` (copy-paste detection) and `pnpm unused:check` (unused exports and files).
3. Update `docs/engineering/component-catalog.md` when you add or change a shared component, hook or helper.

## Scope discipline

Make the change asked for. Do not refactor unrelated code in the same change. If you find worthwhile cleanup elsewhere, note it instead of doing it. Leave touched code cleaner than you found it.

Full standard: `docs/engineering/coding-standards.md`. Review checklist: `docs/engineering/code-review-checklist.md`.
