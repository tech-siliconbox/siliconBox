---
description: Testing expectations
---

# Testing rules

- Unit tests with Vitest; end-to-end with Playwright; load tests with k6.
- `pnpm test:entitlements` runs the full purchase and upgrade matrix from `docs/testing/entitlement-test-matrix.md`. It must pass before any merge that touches entitlements, pricing or sessions.
- Every route has tests for: no session, wrong device, no entitlement, expired entitlement, invalid input, rate limit.
- Drill publish gate: the reference solution must PASS and each seeded-bug variant must FAIL on the real solver. Test this in CI with a small fixture Drill.
- Use fake Razorpay signatures generated in tests; never call the live API from tests.
- Fixtures contain invented learners and invented lesson text only.
