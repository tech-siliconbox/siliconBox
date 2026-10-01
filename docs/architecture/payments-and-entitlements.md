# Payments and entitlements

Razorpay in INR. Access is granted only from a verified webhook or an audited admin action. The access rules are in `docs/product/access-model.md`; this file is the mechanism.

## Checkout flow

1. `POST /checkout` with the chosen level. The server works out the price (full, or the upgrade difference) and creates the Razorpay order. The browser never supplies a price.
2. The learner pays in Razorpay Checkout. The browser's success callback is ignored for access.
3. `POST /webhooks/razorpay`: verify the signature, check the order matches, then in **one transaction** write the entitlement records (one per level opened plus the tool window) and mark the order paid.
4. Duplicate webhooks are harmless because the payment id is unique.
5. A receipt is emailed. No GST for now; the tax rate is a setting.
6. A refund webhook revokes the matching entitlements and is audit-logged.

Card and UPI details never touch our servers.

## Two clocks

| Clock | Record | Rule |
| --- | --- | --- |
| Content | one `content` entitlement per level | Window per `access-model.md` purchase table |
| Tool | one `tool` entitlement | New 3-month window from every purchase or upgrade |

## Checks at request time

- Active means `starts <= now < ends` on the server clock.
- Lesson, Drill and answer routes check the content entitlement for the exact level. Drill runs also need an active tool entitlement.
- Window end locks the level. The outline stays public.

## Admin changes

Admin can extend or shorten any entitlement or grant one (support, refund, scholarship). Each change requires a reason and writes to `audit_log`. Admin grants set `source: admin`.

## Reminder emails

30 days and 7 days before the content and tool windows end.

## Test

Every row of the purchase table is a test. See `docs/testing/entitlement-test-matrix.md`.
