# Phase 4: Payments and launch

Goal: take payment safely and open to learners.

## Tasks

- [ ] Products and prices (INR) in `products`; tax rate setting (default 0)
- [ ] `POST /checkout`: server-side price, upgrade difference while the lower tier is active, idempotency key
- [ ] `POST /webhooks/razorpay`: signature check, order match, one transaction writing entitlements and tool window
- [ ] Refund webhook revokes entitlements
- [ ] Entitlement logic per `docs/product/access-model.md`; `pnpm test:entitlements` covers every matrix row
- [ ] Window end locks level; outline stays; reminders at 30 and 7 days
- [ ] Receipts by email; new-device alert email
- [ ] Admin: prices, promo codes, extend or shorten windows with reason
- [ ] Analytics and Drill pass-rate tracking
- [ ] Terms (with no-sharing clause), refund policy, privacy notice and DPDP consent and deletion flow
- [ ] Vercel Pro live; solver on an always-on host
- [ ] Load test at 2x target on staging; results recorded
- [ ] Third-party penetration test; close critical and high findings
- [ ] Incident plan and runbooks reviewed
- [ ] `/release-check` returns go

## Gate

Load test at 2x and an outside penetration test are clear; Vercel Pro is live.

## Docs to read

`docs/architecture/payments-and-entitlements.md`, `docs/testing/entitlement-test-matrix.md`, `docs/legal/`, `docs/security/security-checklist.md`.
