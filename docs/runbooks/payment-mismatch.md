# Payment mismatch

## Paid but no access

1. Find the order by Razorpay payment id.
2. Check webhook delivery in the Razorpay dashboard and our logs. Replay the webhook if it failed; it is safe because the payment id is unique.
3. If it cannot be replayed, grant access by admin with the reason "payment mismatch" and the payment id.

## Access without payment

1. Check the entitlement source (`order` or `admin`).
2. If `admin` with no reason, review the audit log.
3. If `order` without a paid order, treat as a security incident: review the webhook signature check and recent deploys.
