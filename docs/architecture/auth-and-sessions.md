# Authentication and sessions

Use a maintained library. Two kinds of access stay separate: content and the formal tool.

## Sign-in

- **Better Auth** with the MongoDB adapter. Email + password with breached-password check; Google sign-in. No two-factor for learners (ADR 0025).
- A Google sign-in joins an existing account only when that account's email is verified; otherwise the learner signs in with their password.
- Email verification is required before any purchase: a link (valid one hour) is sent at sign-up through Resend and can be sent again from Settings; Google sign-ins arrive verified (ADR 0028).
- Forgot password: a reset link (valid one hour, one use) by email; the answer is the same whether or not the account exists, and a new password signs the account out on every device.
- Admin: also behind Cloudflare Access (Google sign-in + MFA), on `admin.siliconbox.in`, with a short session.
- Login throttling, generic errors, alert on new-device sign-in.

## Sessions

- Opaque id in an HttpOnly, Secure, SameSite cookie. Never in browser storage.
- The session document records the device and can be revoked at once.

## One device at a time

- A learner has exactly one active session. Signing in on a second device, by password or Google, ends the first.
- Every request checks the session. An open page re-checks every minute, so the old device is signed out within a minute and is told why.
- Purpose: limit account sharing, the most common way paid content leaks.

## Watermark link

The session gives the watermark its identity. See `docs/security/watermarking.md`.

## Account

Data export and delete (DPDP Act). Deletion removes personal data but keeps the audit and order records the law requires.
