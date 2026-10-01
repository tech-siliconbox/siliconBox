---
description: Security rules that apply to all code
---

# Security rules

- Default deny. A route, collection or file is private until a test shows it should be public.
- Secrets live in the host secret store. Never in the repo, client bundle, logs, URLs or error messages. `.env*` files stay out of git.
- Validate every input with a Zod schema from `packages/shared`. Reject unknown fields. Set size limits.
- Strip MongoDB operators from user input. Never spread request data into a query.
- Cookies: HttpOnly, Secure, SameSite=Lax. No tokens in browser storage.
- CORS: explicit allow-list of siliconbox.in origins. Never `*` with credentials.
- Headers: strict CSP with nonces, HSTS, `X-Content-Type-Options`, `frame-ancestors` limited to ourselves, `Referrer-Policy`.
- State-changing calls: origin check plus CSRF token. Checkout and run creation take idempotency keys.
- Log sign-ins, purchases, admin edits and entitlement changes to the append-only audit log. Never log passwords, tokens, card data, answers or lesson text.
- Personal data in URLs or query strings is forbidden.
- Third-party scripts need an ADR. Prefer none.
