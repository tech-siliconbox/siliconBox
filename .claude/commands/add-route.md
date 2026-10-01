---
description: Add an API route that passes all four gates
argument-hint: <METHOD> <path>
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(pnpm test:*), Bash(pnpm typecheck:*)
---

Route: $ARGUMENTS

Read `docs/architecture/api-design.md` and `.claude/rules/api-routes.md`. Add the handler under `/api/v1` using the shared wrapper: authenticate, authorise per object, Zod validation in `packages/shared`, rate limit. Add tests for no session, wrong device, no entitlement, expired entitlement, invalid input and rate limit. Add the route to the table in `docs/architecture/api-design.md`. Run typecheck and tests.
