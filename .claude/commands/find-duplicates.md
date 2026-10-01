---
description: Find duplicated code, unused exports and repeated literals in the repo or a path
argument-hint: [path]
allowed-tools: Read, Grep, Glob, Bash(pnpm dedupe:check:*), Bash(pnpm unused:check:*)
---

Scope: $ARGUMENTS (default: the whole repo).

1. Run `pnpm dedupe:check` and `pnpm unused:check` if they exist and summarise the results.
2. Search by hand for near-identical components, repeated string or number literals that belong in `packages/shared`, repeated route or validation code, and types that mirror Zod schemas.
3. For each finding give the files, the shared place it should live and a short refactor plan. Do not edit unless asked.
