# API design

One versioned REST API at `/api/v1` inside the Next.js app. Default is deny.

## Gates on every route

1. Authenticate (valid session, this device is the active one).
2. Authorise by object (this user holds an active entitlement for this exact lesson, Drill or answer) through the shared `assertEntitled()`.
3. Validate (Zod for body, query and params; unknown fields rejected; size limits).
4. Rate-limit (per IP, per account, per route).

A test fails the build if a route skips a gate (`src/server/api/route-coverage.test.ts`).

In code the order is: origin check on writes, authenticate, rate-limit (per account when signed in, else per IP), validate, authorise the object. Rate-limiting before validation keeps malformed floods cheap. Better Auth's own routes (`/api/auth/*`) use a delegated gate: origin check and rate limit here, validation and sessions inside the library.

## Built so far

| Route | Access | Rate limit |
| --- | --- | --- |
| `GET /api/v1/me` | Signed in | `read` |
| `GET /api/v1/services` | Anyone | `read` |
| `GET, PUT, DELETE /api/v1/resume`; `GET /api/v1/resume/pdf` | Signed in; service open and an active content entitlement (DELETE always allowed) | `read` / `write` |
| `POST, GET, DELETE /api/v1/cv-screenings`; `DELETE /api/v1/cv-screenings/:id` | Same; uploads are multipart, PDF or .docx up to 5 MB | `cvScreen` (10 an hour) / `read` / `write` |
| `GET /api/v1/questions` | Anyone; `q`, `topic`, `company`, `page` (strict query schema) | `read` |
| `POST /api/v1/progress` | Signed in; lesson must be published and readable by the learner | `write` |
| `GET /api/v1/lessons/:id` | Signed in; `readLesson` checks the lesson's level with `assertEntitled` | `read`, plus `contentRead` (12 a minute) |
| `/cms-api/*` | Payload REST for the admin UI; every collection requires a signed-in admin (ADR 0018) | Payload's own; admin host behind Cloudflare Access later |
| `GET, POST /api/auth/*` | Better Auth (sign-up, sign-in, sign-out, session, TOTP) | `read` / `authWrite` |

## Routes

| Area | Routes (examples) | Who may call |
| --- | --- | --- |
| Catalogue | `GET /courses`, `GET /courses/:slug` (outline only) | Anyone |
| Question bank | `GET /questions` | Anyone |
| Question answers | `GET /questions/:id/answer` | Signed in + any active content entitlement |
| Learning | `GET /lessons/:id`, `POST /progress` | Signed in + content entitlement for that level |
| Drills | `GET /drills/:id`, `POST /drills/:id/runs`, `GET /runs/:id` | Signed in + active tool entitlement + content entitlement for the Drill's level |
| Industry Ready | `GET /services`; Resume Builder and CV screening routes | List: anyone. Free tools: signed in + any active content entitlement. Locked services refuse every call |
| Billing | `POST /checkout`, `POST /webhooks/razorpay` | Signed in; webhook by signature only |
| Account | `GET /me`, session, MFA, data export, delete | Owner |
| Admin | `/admin/*` (Payload), including changing a learner's window | Admin role + MFA + Cloudflare Access |

## Cross-cutting controls

- CORS allow-list of siliconbox.in origins only. Never `*` with credentials.
- CSRF: SameSite=Lax HttpOnly cookies, origin check, token on state-changing calls.
- Headers: strict CSP with nonces, HSTS, `X-Content-Type-Options`, `frame-ancestors` limited to ourselves, `Referrer-Policy`.
- Idempotency keys on checkout and run creation.
- Errors: generic to the client, detailed in the server log.
- Never build a MongoDB query from raw request data.
- Standard: OWASP ASVS Level 2 and the OWASP API Security Top 10 as the test checklist.
