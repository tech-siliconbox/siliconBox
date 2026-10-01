# Authentication and sessions

Use a maintained library. Two kinds of access stay separate: content and the formal tool.

## Sign-in

- **Better Auth** with the MongoDB adapter. Email + password with breached-password check; Google sign-in.
- Email verification is required before any purchase.
- **TOTP** two-factor offered to learners.
- Admin: also behind Cloudflare Access (Google sign-in + MFA), on `admin.siliconbox.in`, with a short session.
- Login throttling, generic errors, alert on new-device sign-in.

## Sessions

- Opaque id in an HttpOnly, Secure, SameSite cookie. Never in browser storage.
- The session document records the device and can be revoked at once.

## One device at a time

- A learner has exactly one active session. Signing in on a second device ends the first.
- Every request checks the session. An open page re-checks every minute, so the old device is signed out within a minute and is told why.
- Purpose: limit account sharing, the most common way paid content leaks.

## Watermark link

The session gives the watermark its identity. See `docs/security/watermarking.md`.

## Account

Data export and delete (DPDP Act). Deletion removes personal data but keeps the audit and order records the law requires.
