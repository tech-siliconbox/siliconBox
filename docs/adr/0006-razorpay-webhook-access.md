# 0006. Razorpay with webhook-only access

- Status: Accepted
- Date: 2026-10-01

## Context

The browser cannot be trusted to say a payment happened, and prices must not be tampered with.

## Decision

Price is decided on the server. Razorpay Checkout takes payment. Entitlements are written only by a verified webhook, in one transaction, with a unique payment id.

## Consequences

Duplicate webhooks are safe. Testing uses fake signatures. Refunds revoke entitlements through the refund webhook.
