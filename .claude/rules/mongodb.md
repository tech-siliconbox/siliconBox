---
description: MongoDB and data rules
paths:
  - "apps/web/src/db/**"
  - "apps/web/migrations/**"
  - "packages/shared/src/schemas/**"
---

# MongoDB rules

- Schemas live in `packages/shared` as Zod and are used for API input and for every write.
- Hidden material (`drill_private`, `answers`) sits in its own collections. The learner-facing database user has no read access to them.
- Unique indexes: one record per payment id; one entitlement per user, kind and level.
- Multi-document changes (entitlements plus order status) use a transaction.
- Index every filtered field, for example `{ userId, level, kind }` and `{ userId, lessonId }`.
- Run history: summary in MongoDB, raw logs in object storage, TTL index on old run documents.
- Migrations: migrate-mongo scripts, reviewed in a PR, run from CI. Never by hand in production.
- Reuse one MongoClient per server instance (Atlas free allows 500 connections).
- Backups: nightly `mongodump` while on Atlas free. Practise a restore every quarter.
