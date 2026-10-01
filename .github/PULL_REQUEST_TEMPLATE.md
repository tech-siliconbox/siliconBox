## What and why

## Checklist

- [ ] Types, lint and tests pass (`pnpm typecheck && pnpm lint && pnpm test`)
- [ ] No duplicated code, repeated literals or dead code; existing helpers and components reused (`/review-code` run)
- [ ] Entitlement, pricing or session change? `pnpm test:entitlements` passes
- [ ] New or changed route passes all four gates, with tests
- [ ] No secret, real learner data or premium content in the diff
- [ ] No banned word (`/check-naming` is clean)
- [ ] Docs, ADR and changelog updated where behaviour changed
- [ ] `/review-security` run for routes, auth, payments, content or solver changes
