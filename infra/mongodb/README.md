# MongoDB setup

| Database user | Role | Used by | Env variable |
| --- | --- | --- | --- |
| App | `siliconboxApp` (from `create-app-role.js`) | The web app at request time | `MONGODB_URI_APP` |
| Admin | `dbOwner` on the SiliconBox database | Migrations and Payload admin only | `MONGODB_URI_ADMIN` |

The app user cannot read `drill_private` or `answers`, cannot change or delete `audit_log`,
cannot create indexes, and can only read `courses`, `modules` and `lessons` (Payload writes them
with the admin user). Re-run `create-app-role.js` whenever a migration adds a collection
the app must use.

## Atlas (staging and production)

1. Create the cluster in Mumbai (`ap-south-1`).
2. Database Access: add a custom role `siliconboxApp` with the privileges listed in
   `create-app-role.js`, then create the app user with only that role.
3. Create the admin user with `dbOwner` on the SiliconBox database.
4. Network Access: allow only the hosting provider's egress ranges.
5. Put both connection strings in the host's secret store, never in the repo.

## Local

`docker compose up -d` starts a single-node replica set on `localhost:27017` (transactions
need a replica set) and Redis on `localhost:6379`. Locally one user is enough, so both
variables may point at the same database.
