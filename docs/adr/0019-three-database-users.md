# 0019. Three database users: site, answers reader, admin

- Status: Accepted
- Date: 2026-10-02

## Context

Hidden material (`answers`, `drill_private`) must be unreadable by the learner-facing database
user, yet the site must show a question's answer to a learner with an active entitlement.

## Decision

- `siliconbox_app` (custom role `siliconboxApp`): everything the site does on every request; no
  access to `answers` or `drill_private`; the audit log is insert and read only.
- `siliconbox_answers` (custom role `siliconboxAnswersReader`): read `answers` only. The site
  uses this connection in one place (`src/db/answers.ts`), and only after `assertEntitled`.
- `siliconbox_admin` (built-in `readWrite` and `dbAdmin` on the `siliconbox` database only):
  migrations and Payload CMS. The project-wide `atlasAdmin` user is kept for emergencies only.
- Roles are defined once in `infra/mongodb/roles.json`, applied on Atlas by `atlas-roles.mjs`
  and on self-managed MongoDB by `create-app-role.js`. `pnpm db:verify-roles` proves each user
  can do what it needs and nothing more. `drill_private` gets its own reader for the solver in
  phase 3.

## Consequences

A bug or injection in ordinary site code cannot read answers or Drill solutions through the
main connection. One more secret per environment (`MONGODB_URI_ANSWERS`).
