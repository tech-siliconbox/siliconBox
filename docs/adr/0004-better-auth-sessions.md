# 0004. Better Auth with opaque cookie sessions

- Status: Accepted; TOTP dropped by [0025](0025-sign-in-without-two-factor.md)
- Date: 2026-10-01

## Context

We need strong authentication without writing password handling ourselves, in our own database, with revocable sessions.

## Decision

Use Better Auth with the MongoDB adapter: email + password with breached-password check, Google sign-in, TOTP. Sessions are opaque ids in HttpOnly, Secure, SameSite cookies, revocable at once. Admin additionally sits behind Cloudflare Access with MFA.

## Consequences

Users stay in our database. Hosted alternatives (Clerk, Auth0) remain an option if running auth becomes a burden.
