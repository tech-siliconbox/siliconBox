---
name: razorpay-webhook
description: Use when building checkout, the Razorpay webhook, refunds or receipts. Lists the required steps and the failure cases.
---

# Razorpay flow

1. Server creates the order for the chosen level, less any upgrade credit. Price is computed on the server in INR.
2. Learner pays in Razorpay Checkout. Ignore the browser success callback for access.
3. Webhook: verify the signature, confirm the order matches, then write all entitlement records (one per level opened plus the tool window) and mark the order paid, in one transaction.
4. Duplicate webhooks must be harmless: unique payment id.
5. Send a receipt (no GST for now; tax rate is a setting).
6. Refund webhook revokes the matching entitlements and is audit-logged.

Never handle raw card or UPI data. Use idempotency keys on checkout. Test with generated fake signatures; never call the live API from tests. Details: `docs/architecture/payments-and-entitlements.md`.
