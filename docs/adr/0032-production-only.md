# 0032. One deployed environment: production

- Status: Accepted
- Date: 2026-11-21

## Context

The plan named three environments (dev, staging and production) and a preview deployment per
pull request. The founder decided on 2026-11-21 to run **only production**. A staging copy would
need its own database, solver host, Redis and accounts. That doubles the free tiers of ADR 0022,
which allow one of each, and with one developer there is no one else to test on it.

## Decision

- **Environments:** local development, against the dev Atlas cluster (SiliconBox-Dev), and production.
  There is no staging and no preview deployment.
- **Before production:** every pull request's CI runs the unit, solver and full end-to-end suites
  against a throwaway local stack (MongoDB, Redis, the solver). That stack takes staging's place.
- **Migrations:** reviewed in the pull request, run by CI on a fresh database, applied to the dev
  database, then applied to production by the CI deploy job, never by hand. Each migration is
  backward compatible (add first, remove later), so the build before it still runs.
- **Gates that named staging** are shown on production before it opens to learners, while it
  holds no real data:
  - phase 1: sign-in, roles and backups;
  - the 2x load test;
  - the outside penetration test.

  After launch, load tests run on a local stack, or off-peak on production with test accounts only.
- **Rollback:** redeploy the previous build. Risky features ship behind a switch that is off by default.
- The dev Atlas project keeps its `0.0.0.0/0` entry. Production has its own Atlas project with only
  the host's egress ranges (`infra/mongodb/README.md`).

## Consequences

- One set of hosting accounts and bills, and fewer secrets to keep.
- A change reaches learners without a deployed rehearsal. The full end-to-end suite on every pull
  request, backward-compatible migrations and switches for risky features stand in for one.
- Revisit when a second developer joins, or when releases need a rehearsal with real-sized data.
