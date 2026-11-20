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
| `GET, POST /api/v1/resumes`; `GET, PUT, DELETE /api/v1/resumes/:id` | Signed in; service open and an active content entitlement (DELETE always allowed). Body `ResumeDocumentInputSchema` (name and content); at most `RESUMES_MAX` (5) per learner (`RESUME_LIMIT_REACHED`). PUT answers with the summary (the builder autosaves) | `read` / `write` |
| `GET /api/v1/resumes/:id/pdf`, `GET /api/v1/resumes/:id/docx` | Same; the saved resume as a PDF or Word download | `write` |
| `POST /api/v1/resumes/:id/check` | Same; body `ScreeningOptionsSchema` (an optional job description). Screens the saved resume's own PDF; nothing stored | `resumeCheck` (20 an hour) |
| `POST /api/v1/resumes/import/linkedin` | Same; multipart LinkedIn data export (.zip, up to 10 MB). Only known CSV files are unpacked, each declared size capped; makes a new resume | `resumeImport` (10 an hour) |
| `POST /api/v1/resumes/:id/tailor`; `POST /api/v1/resumes/import/ai` | Same, and `ANTHROPIC_API_KEY` set (until then the builder shows "Coming soon"). Body `TailorRequestSchema`, or a multipart CV with `consentedNotice`; AI allowance, refund on failure, `maxDuration` 150 s (ADR 0030). Tailoring saves nothing; an AI import makes a new resume | `aiRequest` (10 an hour) |
| `POST, GET, DELETE /api/v1/cv-screenings`; `DELETE /api/v1/cv-screenings/:id` | Same; uploads are multipart, PDF or .docx up to 5 MB, with an optional `jobDescription` field (`ScreeningOptionsSchema`). POST keeps the file with its report and answers with the saved screening and the text read from the file, which is not stored. DELETE removes reports with their files | `cvScreen` (10 an hour) / `read` / `write` |
| `GET /api/v1/cv-screenings/:id/file` | Same; the learner's own kept CV as a download (`CV_FILE_NOT_KEPT` once it is past the newest 5) | `write` |
| `POST /api/v1/cv-screenings/:id/feedback` | Same, and `ANTHROPIC_API_KEY` set; body `CvFeedbackRequestSchema` (the agreed notice's version, optional job description). Uses the AI allowance (5 a day, 30 a month), given back on failure; `maxDuration` 150 s (ADR 0030) | `aiRequest` (10 an hour) |
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
| Praman (formal tool page, ADR 0031) | `GET`/`POST /tool/sessions`, `PATCH`/`DELETE /tool/sessions/:id`, `POST /tool/sessions/:id/open`, `GET /tool/sessions/:id/poll`, `POST /tool/sessions/:id/commands`, `POST /tool/sessions/:id/stop`, `GET`/`PUT`/`DELETE /tool/sessions/:id/files`, `POST /tool/sessions/:id/example`, `GET /tool/sessions/:id/trace`, `GET /tool/sessions/:id/script`, `POST /tool/sessions/:id/what-if` (202 with a request id while it proves; `GET /tool/sessions/:id/what-if/:requestId` reads it), `GET /tool/sessions/:id/drivers`, `GET /tool/sessions/:id/coverage-trace`, `GET /tool/sessions/:id/equivalence-trace`, `GET /tool/sessions/:id/report` (HTML, download only, sandboxed), `GET /tool/runs`, `GET`/`DELETE /tool/runs/:id`, `GET /tool/runs/:id/trace`, `GET /tool/runs/:id/diff`, `GET /tool/runs/:id/log`, `GET /tool/runs/:id/files` (a file as it was when the run started), `POST /tool/runs/:id/restore` | Signed in + active tool entitlement + any active content entitlement; the learner's own sessions and runs. Delete works after access ends (DPDP) |
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
