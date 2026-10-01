# apps/web

The SiliconBox website, API and admin (Next.js + Payload CMS).

## Run locally

1. `docker compose up -d` from the repo root (MongoDB replica set and Redis).
2. Create `apps/web/.env.local` (git-ignored) with the variables in `../../.env.example`. Locally
   `MONGODB_URI_APP` and `MONGODB_URI_ADMIN` can both be
   `mongodb://127.0.0.1:27017/siliconbox_dev?replicaSet=rs0&directConnection=true`, `REDIS_URL` is
   `redis://127.0.0.1:6379`, `BETTER_AUTH_URL` is `http://localhost:3000`, and
   `BETTER_AUTH_SECRET` is any 32+ character random string (`openssl rand -base64 48`).
3. `pnpm db:migrate`, then `pnpm dev`.

End-to-end tests: `pnpm build`, then `pnpm test:e2e` (starts `next start` unless one is running).

Architecture: `../../docs/architecture/system-overview.md`.
