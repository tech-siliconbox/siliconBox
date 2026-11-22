# Deploy

## Before

- [ ] First deploy of an environment: create the CMS Owner account at `/admin` before the site is reachable (until it exists, anyone can create it)

- [ ] CI green: typecheck, lint, tests, `pnpm test:entitlements`, scans
- [ ] Migrations reviewed and backward compatible; run by CI on a fresh database, then on the dev database (there is no staging, ADR 0032)
- [ ] `CHANGELOG.md` updated
- [ ] If routes, auth, payments or solver changed: `/review-security` clean

## Steps

1. Merge to main once CI is green (its end-to-end suite runs on a throwaway local stack).
2. Run production migrations from CI, not by hand, then deploy.
3. Smoke test production: sign in, read a lesson, run a Drill, open Praman; before payments open, a
   purchase by the team, then refunded.
4. Watch error rate, webhook failures and queue depth for 30 minutes.

## Rollback

Promote the previous deployment. If a migration was run, use its down step only if the change was not yet read by new code; otherwise fix forward. Note it in the changelog.
