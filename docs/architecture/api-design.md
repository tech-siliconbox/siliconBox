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

No route returns lesson, Drill, answer or question text; those reach the browser only inside their server-rendered page (ADR 0027).

| Route | Access | Rate limit |
| --- | --- | --- |
| `GET /api/v1/me` | Signed in | `read` |
| `PUT /api/v1/profile` | Signed in; handle, bio and links (`ProfileSchema`); a taken handle is 409 | `write` |
| `GET, PUT, DELETE /api/v1/profile/photo` | Signed in; the learner's own photo only. PUT takes a JPEG, PNG or WebP up to 5 MB, checked by its bytes and re-encoded | `read` / `photoUpload` (10 an hour) / `write` |
| `POST /api/v1/assessments/:id/attempts` | Signed in; content access to the assessment's level; an answer for every question; at most 3 attempts. Returns the score only (ADR 0029) | `write` |
| `PUT /api/v1/capstones/:id/submission` | Signed in; content access to the capstone's level; one .zip up to 10 MB, checked by its bytes; refused once passed | `capstoneUpload` (10 an hour) |
| `GET /api/v1/me/export` | Signed in; the learner's own data as a JSON file, audit-logged (DPDP) | `dataExport` (5 an hour) |
| `GET /api/v1/services` | Anyone | `read` |
| `GET, PUT, DELETE /api/v1/resume`; `GET /api/v1/resume/pdf` | Signed in; service open and an active content entitlement (DELETE always allowed) | `read` / `write` |
| `POST /api/v1/resume/check` | Same; body `ScreeningOptionsSchema` (an optional job description). Screens the saved resume's own PDF; nothing stored | `resumeCheck` (20 an hour) |
| `POST, GET, DELETE /api/v1/cv-screenings`; `DELETE /api/v1/cv-screenings/:id` | Same; uploads are multipart, PDF or .docx up to 5 MB, with an optional `jobDescription` field (`ScreeningOptionsSchema`). POST answers with the saved screening and the text read from the file, which is not stored | `cvScreen` (10 an hour) / `read` / `write` |
| `POST /api/v1/progress` | Signed in; lesson must be published and readable by the learner | `write` |
| `/cms-api/*` | Payload REST for the admin UI; every collection requires a signed-in admin (ADR 0018) | Payload's own; admin host behind Cloudflare Access later |
| `GET, POST /api/auth/*` | Better Auth (sign-up, sign-in, Google, sign-out, session, change password, delete account) | `read` / `authWrite` |

## Routes

| Area | Routes (examples) | Who may call |
| --- | --- | --- |
| Catalogue | `GET /courses`, `GET /courses/:slug` (outline only) | Anyone |
| Question answers | Page `/questions/:slug` only (no API) | Signed in + any active content entitlement |
| Learning | Page `/courses/:course/:lesson` only; `POST /progress` | Signed in + content entitlement for that level |
| Drills | Page `/courses/:course/drills/:drill`; `POST /drills/:id/runs`, `GET /runs/:id` | Signed in + active tool entitlement + content entitlement for the Drill's level |
| Industry Ready | `GET /services`; Resume Builder and CV screening routes | List: anyone. Free tools: signed in + any active content entitlement. Locked services refuse every call |
| Billing | `POST /checkout`, `POST /webhooks/razorpay` | Signed in; webhook by signature only |
| Account | `GET /me`, session, data export, delete | Owner |
| Admin | `/admin/*` (Payload), including changing a learner's window | Admin role + MFA + Cloudflare Access |

## Cross-cutting controls

- CORS allow-list of siliconbox.in origins only. Never `*` with credentials.
- CSRF: SameSite=Lax HttpOnly cookies, origin check, token on state-changing calls.
- Headers: strict CSP with nonces, HSTS, `X-Content-Type-Options`, `frame-ancestors` limited to ourselves, `Referrer-Policy`.
- Idempotency keys on checkout and run creation.
- Errors: generic to the client, detailed in the server log.
- Never build a MongoDB query from raw request data.
- Standard: OWASP ASVS Level 2 and the OWASP API Security Top 10 as the test checklist.
