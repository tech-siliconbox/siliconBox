---
description: Create a migrate-mongo migration with schema and index updates
argument-hint: <short-description>
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(pnpm db:migrate:*)
---

Create a migration named `$ARGUMENTS` in `apps/web/migrations/`. Update the Zod schema in `packages/shared` and `docs/architecture/data-model.md`. Include indexes and a down step. Then run the `db-migration-reviewer` subagent on the result.
