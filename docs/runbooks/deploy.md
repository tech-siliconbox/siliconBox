# Deploy

## Before

- [ ] First deploy of an environment: create the CMS Owner account at `/admin` before the site is reachable (until it exists, anyone can create it)

- [ ] CI green: typecheck, lint, tests, `pnpm test:entitlements`, scans
- [ ] Migrations reviewed; run first on staging
- [ ] `CHANGELOG.md` updated
- [ ] If routes, auth, payments or solver changed: `/review-security` clean

## Steps

1. Merge to main; preview and staging deploy automatically.
2. Run migrations on staging (`pnpm db:migrate`), then smoke tests: sign in, read a lesson, run a Drill, test-mode payment.
3. Promote to production. Run production migrations from CI, not by hand.
4. Smoke test again; watch error rate, webhook failures and queue depth for 30 minutes.

## Rollback

Promote the previous deployment. If a migration was run, use its down step only if the change was not yet read by new code; otherwise fix forward. Note it in the changelog.
