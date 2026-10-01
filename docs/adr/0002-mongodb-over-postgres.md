# 0002. MongoDB Atlas as the database

- Status: Accepted
- Date: 2026-10-01

## Context

Lessons are nested blocks that suit documents. Payload CMS supports MongoDB natively. MongoDB has no row-level security and has weaker built-in relational guarantees than Postgres.

## Decision

Use MongoDB Atlas in the Mumbai region, free tier to start. Enforce money rules with unique indexes and transactions. Enforce access in application code through one shared authorisation function, and keep hidden answers and solutions in separate collections that the learner-facing database user cannot read.

## Consequences

Schema discipline moves into Zod and migrate-mongo. Atlas free has no backups, so run nightly mongodump and move to a paid tier for point-in-time backups. Atlas Search is not on the free tier, so question search uses a text index.
