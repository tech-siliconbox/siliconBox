# MongoDB setup

| Database user | Role | Used by | Env variable |
| --- | --- | --- | --- |
| `siliconbox_app` | `siliconboxApp` (custom) | The site at request time | `MONGODB_URI_APP` |
| `siliconbox_answers` | `siliconboxAnswersReader` (custom: read `answers` only) | Question answers, after the entitlement check | `MONGODB_URI_ANSWERS` |
| `siliconbox_grader` | `siliconboxGrader` (custom: read `drill_privates` only) | Grading Drill runs against hidden designs (ADR 0021) | `MONGODB_URI_GRADER` |
| `siliconbox_admin` | `readWrite` and `dbAdmin` on the `siliconbox` database | Migrations and Payload CMS | `MONGODB_URI_ADMIN` |

The site user cannot read `answers` or `drill_private`, cannot change or delete `audit_log`,
cannot create indexes, and can only read content collections (Payload writes them with the admin
user). Why three users: ADR 0019. Roles are defined once in `roles.json`.

## Atlas (each environment)

1. Cluster in Mumbai (`ap-south-1`).
2. `atlas auth login`, then `node infra/mongodb/atlas-roles.mjs <projectId>` creates or updates
   the custom roles from `roles.json`.
3. Create the four users (`atlas dbusers create ... --scope <cluster>`), each with only its role,
   and put the connection strings in the host's secret store, never in the repo.
4. `pnpm db:verify-roles` must print only `ok` lines.
5. Network Access: allow only the hosting provider's egress ranges.

Dev (2026-10-02): all of the above done on `siliconbox-dev`; 11 of 11 checks pass.
Dev (2026-11-18): `siliconbox_grader` still to create (Atlas CLI session expired); until then
`MONGODB_URI_GRADER` in `apps/web/.env.local` falls back to the admin user, which
`pnpm db:verify-roles` reports.

Payload stores the `drill_private` collection as `drill_privates`; roles and checks use that name.

## Local or self-managed

`docker compose up -d` starts a single-node replica set; `mongosh "$MONGODB_URI_ADMIN" --file
infra/mongodb/create-app-role.js` creates the same roles. Without users, all three variables may
point at the same database.
