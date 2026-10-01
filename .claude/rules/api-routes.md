---
description: Rules for API route handlers
paths:
  - "apps/web/src/app/api/**"
  - "apps/web/src/server/**"
---

# API route rules

Every handler goes through the shared wrapper in this order:

1. **Authenticate**: valid session, device still the active one.
2. **Authorise**: check this user holds an active entitlement for this exact lesson, drill or answer. Call the shared `assertEntitled()`; never inline the check.
3. **Validate**: Zod schema for body, query and params. Unknown fields rejected.
4. **Rate-limit**: per IP, per account and per route; stricter on login, checkout, run-start and content reads.

Also:

- Routes live under `/api/v1`. Responses for paid content set `Cache-Control: private, no-store`.
- Return one lesson at a time, never a whole course. Use opaque ids.
- Errors are generic to the client and detailed in the server log.
- Add a test for each gate. A route test that skips a gate must fail the build.
- Price, quota, depth, timeout and solver settings come from the server, never from the request.
