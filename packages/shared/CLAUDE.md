# packages/shared

Code used by both the web app and tooling: Zod schemas, constants, entitlement and price rules.

- One Zod schema per API input and per stored document. Unknown fields are rejected.
- Strip MongoDB operators in schemas that accept free-form objects.
- Entitlement and price functions are pure (input in, result out, clock passed in) so they are easy to test against `docs/testing/entitlement-test-matrix.md`.
- Constants: level prices (INR), window lengths, caps per level. Change them only with an update to `docs/product/access-model.md`.
- This package is the single source of truth: if a value or rule is needed in two places, it lives here.
- Derive types with `z.infer`; never restate them elsewhere.
- No secrets, no I/O.

Layout: `src/schemas/`, `src/entitlements/`, `src/pricing/`, `src/constants.ts`.
