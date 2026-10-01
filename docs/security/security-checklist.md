# Pre-launch security checklist

Use with `/release-check`. Mark each item done with evidence.

## Content and access
- [x] No paid content in any JS bundle, static page, sitemap, feed or search index (e2e `lessons.spec.ts`: locked page scripts and prerender manifest; no sitemap or feed exists)
- [x] Paid responses are `private, no-store` (e2e checks the lesson page and lesson API headers)
- [x] Every route passes authenticate, authorise, validate, rate-limit (tests exist) (`route-coverage.test.ts` fails the build on an ungated route; `gate.test.ts` covers each gate)
- [ ] Hidden collections unreadable by the learner-facing database user
- [ ] Entitlement matrix passes (`pnpm test:entitlements`)
- [x] One active device enforced; old device signed out within a minute (e2e `auth.spec.ts`, second-device test)
- [x] Watermarks present on all paid views (e2e checks the visible tile and the invisible mark on a paid lesson)

## Payments
- [ ] Price decided on the server only
- [ ] Webhook signature verified; duplicate webhooks harmless
- [ ] Entitlements written in one transaction
- [ ] Refund webhook revokes entitlements

## Platform
- [x] CORS allow-list, CSRF, security headers, CSP nonces (no cross-origin access is granted; origin check on every write; headers in `next.config.ts`; nonce CSP in `src/proxy.ts`)
- [ ] Secrets only in the host store; secret scanning in CI
- [ ] Admin on its own host behind Cloudflare Access + MFA
- [ ] Audit log active and append-only
- [ ] Dependency and image scanning in CI; versions pinned
- [ ] Backups running; one restore practised

## Solver
- [ ] All rows in `solver-hardening.md` Fixed with tests
- [ ] Runners isolated and network-less
- [ ] Quotas and caps per level

## Independent checks
- [ ] Load test at 2x passed
- [ ] Third-party penetration test complete; critical and high findings closed
- [ ] Incident plan written and reviewed

## Status notes (2026-10-02)

Partly done, not ticked:
- Hidden collections: `infra/mongodb/create-app-role.js` defines the least-privilege role, but the dev database still uses an admin user, so it is not enforced yet.
- Entitlement matrix: rows 1 to 16 and 22 are automated; rows 17 to 21 and 24 arrive with payments (phase 4); row 23 is the one-device e2e test.
- Secret scanning, dependency scanning, CI: configured in `.github/workflows/ci.yml`, never run, because the code is not yet in a GitHub repository.
- Audit log: written for sign-ins, device replacement and access grants; append-only in code, and in the database once the app role is in use.
- Backups: script and workflow ready; one unencrypted local restore drill passed; storage not chosen.
