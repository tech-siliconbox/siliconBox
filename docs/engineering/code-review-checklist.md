# Code review checklist

Use for every change, by a person or by the `code-reviewer` subagent (`/review-code`).

## Reuse and redundancy
- [ ] I searched for an existing helper, hook, component, schema or constant before adding one
- [ ] No duplicated block, near-identical component or repeated markup
- [ ] No repeated literals (prices, caps, routes, messages); they come from `packages/shared`
- [ ] No hand-written type that mirrors a Zod schema
- [ ] No unused imports, exports, parameters, files or flags; no commented-out code

## Structure
- [ ] Each function and component does one thing and is small
- [ ] Logic sits in the right layer (page thin, route uses wrapper and service, repository builds queries)
- [ ] Pure rules are pure and take the clock as input
- [ ] Composition instead of many boolean props
- [ ] No unrelated refactor mixed in

## Safety and correctness
- [ ] Routes pass the four gates; hidden data is not exposed; price and limits come from the server
- [ ] Errors are typed and mapped in one place; nothing swallowed
- [ ] No `any`, unchecked casts or `@ts-ignore` without a reason

## Quality
- [ ] Names say what things are; comments say why
- [ ] Accessibility handled in the component
- [ ] Tests cover new logic and each gate; mocks only at process boundaries
- [ ] `docs/engineering/component-catalog.md` and other docs updated
- [ ] Checks pass: typecheck, lint, test, dedupe, unused, deps
