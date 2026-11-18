# 0028. Email through Resend; verify the address before a purchase

- Status: Accepted (founder, 2026-11-18)
- Date: 2026-11-18

## Context

The access model requires a verified email before any purchase: receipts, refunds and account
recovery go to that address, and a Google sign-in may only join a password account whose email
is verified (ADR 0025). The site had no way to send email. The hosting plan (ADR 0022) named a
free transactional provider; the founder chose Resend.

## Decision

- Email goes out through Resend's HTTP API (`src/server/email.ts`), one call per message, no SDK.
  The key is send-only and lives in the host secret store (`RESEND_API_KEY`); the sender is
  `EMAIL_FROM`. Without both, nothing is sent. Replies go to `EMAIL_REPLY_TO`
  (the team's Outlook inbox): a sender must be on a domain verified in Resend, which
  `outlook.com` cannot be, so the Outlook address receives replies instead of sending.
- At sign-up a password learner gets a verification link (valid one hour). The account page
  offers to send it again. Google sign-ins arrive verified. Opening the link does not sign in,
  so verifying on a phone never signs the laptop out (one device at a time).
- A failed send never blocks sign-up (it is logged); asked for again, a failure is shown.
- Forgot password sends a reset link the same way. Its answer is the same whether or not the
  account exists, even when sending fails, so it never reveals who has an account; a new
  password signs the account out on every device.
- Reserved test domains (`example.test` and similar) are never sent to.
- Checkout (phase 4) refuses a purchase until the email is verified.

## Consequences

- Until `siliconbox.in` is verified in Resend (DNS records at the domain host), Resend's test
  sender `onboarding@resend.dev` delivers only to the Resend account's own address. Production
  needs the domain verified and `EMAIL_FROM` set to an address on it.
- Resend's free plan caps sends per day and month; enough for verification and receipts at the
  start (ADR 0022 thresholds apply).
