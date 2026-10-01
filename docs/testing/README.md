# Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Unit | Vitest | Schemas, entitlement and price logic, watermark generation |
| Route | Vitest | Each route: no session, wrong device, no entitlement, expired entitlement, invalid input, rate limit, happy path |
| End to end | Playwright | Sign-in, one-device sign-out, read a lesson, run a Drill, test-mode purchase and upgrade |
| Solver | Pytest + attack tests | Each hardening finding has a regression test; attack test against the deployed runner |
| Drill gate | CI | Fixture Drill: reference PASS, seeded bug FAIL on the real solver |
| Load | k6 | 2x target on staging; see `docs/architecture/scaling.md` |
| Security | Scans + review + external pen test | Dependency and image scans, secret scan, `/review-security`, third-party test |

## Rules

- Entitlement, pricing and session changes always add tests.
- Fake Razorpay signatures only; never call the live API from tests.
- Invented learners and invented lesson text in fixtures.
- Tests that need the solver use the small fixture Drill.
