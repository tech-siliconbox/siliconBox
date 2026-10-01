# Entitlement test matrix

Run by `pnpm test:entitlements`. Dates are relative to purchase date `d`; "m" is months. Each row is a test; add boundary cases (last second before `ends`, first second after).

## Purchase and upgrade

| # | Buy | Hold (active) | Price | Content after | Tool after |
| --- | --- | --- | --- | --- | --- |
| 1 | Basic | none | ₹5,000 | Basic to d+3m | new window d to d+3m |
| 2 | Intermediate | none | ₹10,000 | Basic and Intermediate to d+6m | new window d to d+3m |
| 3 | Advance | none | ₹15,000 | Basic, Intermediate, Advance to d+9m | new window d to d+3m |
| 4 | Intermediate | Basic | ₹5,000 | Intermediate to d+3m; Basic keeps its own end | new window from d |
| 5 | Advance | Basic | ₹10,000 | all three to d+9m | new window from d |
| 6 | Advance | Intermediate | ₹5,000 | all three to d+9m | new window from d |
| 7 | Intermediate | Basic ended | ₹10,000 | same as row 2 | new window from d |
| 8 | Advance | Basic ended | ₹15,000 | same as row 3 | new window from d |
| 9 | Advance | Intermediate ended | ₹15,000 | same as row 3 | new window from d |
| 10 | Basic | Basic (active, repurchase) | ₹5,000 | Basic restarts a fresh window from d | new window from d |

## Access

| # | State | Lesson | Drill run | Answer | Resume Builder, CV screening |
| --- | --- | --- | --- | --- | --- |
| 11 | No account | outline only | no | no | no |
| 12 | Signed in, nothing bought | outline and first lesson | no | no | no |
| 13 | Content active, tool ended | yes | no | yes | yes |
| 14 | Content ended, tool active | no | no | no | no |
| 15 | Level not held (another level is active) | no for that level | no for that level | no for that level | yes, while any content entitlement is active |
| 16 | Window ended | locked; outline public | no | no | no |

A Drill run needs both an active content entitlement for that Drill's level and an active tool entitlement.

## Integrity

| # | Case | Expected |
| --- | --- | --- |
| 17 | Duplicate webhook | no duplicate entitlements |
| 18 | Bad signature | rejected; no entitlement |
| 19 | Order amount mismatch | rejected |
| 20 | Client sends a price or level it does not own | ignored; server decides |
| 21 | Refund webhook | matching entitlements revoked; audit entry |
| 22 | Admin extends or shortens a window | change applied; reason required; audit entry |
| 23 | Second sign-in | first session ends within a minute |
| 24 | Concurrent purchases | unique index keeps one entitlement per user, kind and level |

## Automated coverage (2026-10-02)

| Rows | Where | Status |
| --- | --- | --- |
| 1 to 10 | `packages/shared/src/pricing/quote.test.ts` (plus boundary cases) | Automated |
| 11 to 16 | `packages/shared/src/entitlements/access.test.ts` | Automated |
| 22 | `apps/web/src/server/grants.test.ts` and e2e `lessons.spec.ts` (Support grant, reason, audit entry) | Automated |
| 23 | e2e `auth.spec.ts` (second sign-in) | Automated |
| 17 to 21, 24 | Webhook, refunds and concurrent purchases | Phase 4 |
