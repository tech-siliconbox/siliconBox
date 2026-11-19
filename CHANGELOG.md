# Changelog

All notable changes are listed here, newest first. Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org) once a first release exists.

## [Unreleased]

### Added (graded course work, ADR 0029)

- Assessments: a course's multiple-choice assessment is answered in its module page and scored on the server against a hidden key (`assessment_keys`, read only by the grader database user). At most 3 attempts, no waiting; the review with right answers and explanations appears only once the learner passed or used every attempt. The Basic course's 30-question assessment (pass 24) was converted; its answer key is no longer printed in the page.
- Capstone projects: learners upload one .zip (up to 10 MB, checked by its bytes) from the module page; our experts (Editors and the Owner) download it at `/admin-tools/capstones`, score each rubric criterion and write feedback (audit-logged). Learners see scores and feedback in the page; a failing grade lets them send a new version.
- Performance (`/performance`): each course's assessment and capstone results; a course passes when both pass. In the avatar menu and the sidebar.
- The course converter turns an assessment section and a rubric table into graded course work; the importer writes assessments, keys and capstones. New collections and indexes (migration `20261010000000-course-work`); re-apply the database roles.
- Shared: account forms' `ActionForm`, `useFormAction` and `FormError` moved out of the auth feature for every feature's forms.

### Added (member area)

- An avatar menu in the header for signed-in learners (name, email, Overview, Settings, Help, Sign out), on member and public pages alike. It replaces the Account link and the separate sign-out button.
- Overview (`/dashboard`, was `/account`): modules done, Drills solved, day streak (India time), the next lesson to read, each course's access and progress, getting-started steps and recent activity.
- Settings (`/settings`): change the name or the password (other devices are signed out), see whether the email is verified and send the link again, and see each level's and the formal tool's window.
- Help (`/help`): questions and answers written in the CMS (new `faqs` collection, drafts and publish like lessons). The site's database role may read it; re-apply roles with `node infra/mongodb/atlas-roles.mjs <projectId>`.
- Names are kept to 100 characters on the server too, whatever the client sends.
- Activity (`/activity`): day streak, longest streak, days active, lessons and runs; the last 12 months as a square a day in the design's heat colours (scrolls to this week on phones); the 20 most recent lessons and runs. Listed in the avatar menu and the sidebar.
- Profile, in Settings: photo (re-encoded on the server as a 256 px WebP without EXIF, kept in MongoDB until object storage exists), handle (unique), bio and LinkedIn, GitHub and website links, checked by one shared schema in the browser and on the server. Shown on the Overview; the photo replaces the initials in the avatar menu. Included in the data download and removed with the account. New `profiles` and `avatars` collections (migration `20261009000000-profiles`); re-apply the database roles. `sharp` 0.35.5 is now a direct dependency.
- Your data (DPDP), in Settings: download everything we hold as a JSON file (`GET /api/v1/me/export`, 5 an hour, no tokens, Drill code or watermark codes), or delete the account with the password (Google accounts: type the email, signed in within a day). Deletion empties the learner's own collections; the audit log, security alerts and admin grant records stay. Both are audit-logged.

### Changed (sign-in, ADR 0025)

- Learners sign in with email and password or with Google; two-factor sign-in is removed and its stored secrets deleted (migration `20261007000000-remove-two-factor`). One device at a time stays: a new sign-in, by either method, signs out every other device.
- A Google sign-in for an email that already has an unverified password account is refused with a clear message, so nobody can capture another person's Google sign-in.
- Public pages show Account and Sign out to a signed-in learner.
- Sign-in and sign-up put "Continue with Google" first, as the standard white button with Google's mark, then "or" and the email form, in one centred card with the SiliconBox mark; password fields can show what was typed.
- Forgot password: "Forgot password?" sends a one-hour reset link by email; setting a new password signs the account out everywhere. The answer never reveals whether an account exists.
- End-to-end tests read their address from `E2E_BASE_URL` (default http://localhost:3000), so a production server can run on another port beside `pnpm dev`.

### Changed (catalogue and pricing)
- Courses shows Basic, Intermediate and Advance as three equal cards in one row, like Pricing; both fit a laptop screen without scrolling (1280×800 and up). Section pages share one intro (`PageIntro`).

### Changed (access)
- All of Module 1 is free for any signed-in visitor (founder, 2026-11-18); the access model now says so.

### Added (email, ADR 0028)

- Email through Resend: password learners get a verification link at sign-up and can ask for it again on the account page; verification is needed before a purchase. A failed send never blocks sign-up. Replies go to the team inbox (`EMAIL_REPLY_TO`).
- The site's database role may list indexes (read-only), so Better Auth sees the indexes our migrations made and stops logging errors at start-up; applied with `node infra/mongodb/atlas-roles.mjs <projectId>`.

### Changed (dependencies)

- Every dependency pinned to an exact stable version (web, shared, tooling, overrides); new installs save exact versions. React 19.3.1 (patch), which the CMS requires. The HTML libraries pages use at run time are runtime dependencies now, not dev-only.
- Solver: Python packages pinned, with `constraints.txt` fixing every sub-dependency; local setup uses Python 3.12 like the image; Docker bases pinned to `python:3.12.16-slim-bookworm` and `debian:bookworm-20261104-slim`.

### Changed (addresses and content protection, ADR 0026, 0027)

- Page addresses read as the content: `/courses/basic/formal-tool-flow`, `/courses/basic/drills/first-proof-the-mod-3-counter`, `/questions/<the question's words>`. No database or public id in the address bar. Questions got slugs (migration `20261008000000-question-slugs`).
- Golden rule: content reaches the browser only inside its page. Removed the unused content APIs (`GET /api/v1/lessons/:id`, `GET /api/v1/questions/:id/answer`, `GET /api/v1/questions`); no link prefetches (`SiteLink`); AI crawlers and scraping tools get 403 and are named in robots.txt; every response asks AI systems not to reuse it (`X-Robots-Tag: noai, noimageai`).
- The content importer clears optional fields a file leaves out, so the file is the source of truth.

### Added (course navigation)

- Each module in the course index folds out to its parts with what each is (theory, lab, practice, project), where the practice tool is, and its share of the module's time; clicking a part jumps to it.
- Every lesson shows its course's modules beside it: reading time per module, completion marks, progress, the current module and locked modules. A sticky sidebar on wide screens, a fold-out list on phones.
- Lessons use the desktop width (lined up with the site header) and fit phones; the Drill editor's toolbar wraps so Run verification stays on screen.

### Changed (course pages, ADR 0024)

- Each module of a course written in HTML is one page with all its content: text word for word, code, tables, colour-coded boxes (note blue, tip green, warning amber, danger red), learning objectives, labs, quizzes and diagrams, shown in the site's design (Geist, the site's lesson styles). The course home is the public course page. The course's own stylesheet is no longer stored or served.
- The site's own callout block uses the same colour coding by tone.
- Each lab is followed by its Drill: brief and editor with Run verification in the page.
- Basic: three new Drills for Labs 5, 6 and 7 (property drills on a job unit, properties for a small peripheral, judging the assumptions on a FIFO), gate-verified and published; all 8 Basic Drills pass the publish gate.

### Fixed (solver)

- `sig[->N] ##K expr` after an implication is checked (it was skipped silently), counting from the cycle after the trigger for `|=>` and from the trigger cycle for `|->`.
- A run whose properties use SVA the tool cannot check yet stops with the statement named, instead of passing without checking it.

### Added (copy protection)

- Paid text on lessons, Drill briefs and answers cannot be selected, copied, cut, dragged, right-clicked or printed, and blurs while the window is out of focus or after PrintScreen; code examples have a Copy button (ADR 0023).

### Added (watermark trace)

- Watermark trace tool at `/admin-tools/trace` for Support and Owner: paste leaked text or a visible mark from a screenshot, see the learner accounts it came from. Rate-limited and audit-logged (`watermark_trace`); the text is never stored.

### Changed (dependencies)

- Payload 3.94.0 (needs Node 26.13.1 or newer locally); its own patched undici and mongoose replace the overrides.

### Security

- Next.js 16.4.6 (critical: unauthenticated remote code execution), Payload 3.93, zod 4.6.7; patched undici, mongoose, dompurify and vite through overrides; sass moved to the current 1.x line and its optional file watcher skipped, which removes picomatch (GHSA-fc5q-39xc-vjpf, no fix released) from the runtime.

### Removed

- The nightly backup workflow, which had never run (no storage or secrets): backups are off while the database holds only development data (ADR 0022).

### Added

- Runs are graded against the Drill's hidden designs (ADR 0021): a prove-it Drill needs the checker to catch every seeded bug, a find-the-bug Drill needs it to hold on the correct design. The learner sees counts ("caught 3 of 4 seeded bugs"), never the designs. A fourth database user, `siliconbox_grader`, reads only `drill_privates`.
- Free-tier hosting plan (ADR 0022, `docs/architecture/hosting.md`): Vercel Hobby in Mumbai, Atlas M0, Upstash free, Oracle Cloud free Arm VM for the solver, Cloudflare free; paid plans at the first sale.

### Changed

- Every MongoDB client keeps at most 10 pooled connections (Atlas M0 allows 500 in all). The solver worker waits on the queue in 120-second blocks, cutting idle Redis commands four times.
- Drill publish gate: `pnpm drills:verify <file>` runs every Drill's reference solution on the real solver (target on its design, PASS on the reference design, FAIL on every bug variant, starter not already solved). Tested in CI on an invented fixture Drill.
- Drills in the content import file, with their private part; `prune` removes lessons or Drills a file no longer lists (reported otherwise).
- Five Basic Drills from Labs 4, 8 and 9 (mod-3 counter, FIFO bug hunt, FIFO flags and data order, starving arbiter, transaction FSM), gate-verified and imported as drafts.
- ADR 0021 (proposed): grade runs against the hidden designs.

### Changed

- Converted modules end with one review lesson ("Summary · Exercises · Quick quiz"), each section keeping its heading: Basic now has 81 lessons.
- Solver: helper logic in a properties module (wires, registers, always blocks) is kept; it used to be dropped, so properties reading a helper register read a free signal.

### Fixed

- `pnpm db:verify-roles` and the end-to-end cleanup used `drill_private`, but Payload stores that collection as `drill_privates`: the role check proved nothing (access was in fact refused) and test runs left 18 orphaned private parts, now removed.
- Drill workspace at `/drills/:id`: the brief beside an editor (design read-only, properties editable and kept in the browser), Run with polling and queue position, results per property, and counterexample and cover traces as waveforms. Drills appear on the course outline.
- Reading a Drill needs the content window for its level; running it also needs the tool window. The page says so instead of failing.
- The real Basic course (11 modules, 93 lessons) converted word for word from the founder's HTML and imported over the demo slugs on the dev database.
- `pnpm content:convert <folder> <level> <out.json>`: course HTML pages to an import file; one lesson per section, diagrams keep their colours, and every place where something could not be kept exactly is listed.
- Lesson blocks: `list` (with answers behind "Show answer" and a start number), `table`, `reveal` (show/hide hints and solutions), `stateGraph` (an interactive simulation-vs-formal figure whose states, transitions and text live in the lesson, checked in the CMS), heading level 4, `danger` callouts with titles, code file names and diagram captions.
- Lesson text format: `code`, **bold** and *italic* inline, paragraphs and bullets in multi-line fields (`packages/shared/src/inline-text.ts`).

### Fixed

- `pnpm content:import` failed once the lesson-cache hook existed: the hook loaded server-only code in the command-line script. Scripts now pass `SCRIPT_CONTEXT` and the hook skips.

### Changed

- First lesson of each course is free for signed-in learners (founder's decision; access model updated to match the test matrix).
- The invisible watermark now also marks list items and the prose inside reveals.
- Drill runs on the site: `POST /api/v1/drills/:id/runs` (content and tool access for the Drill's level, daily quota by highest level, idempotent `requestId`, only the learner's code accepted) and `GET /api/v1/runs/:id` (owner only); identical code answered from `run_cache`; migration 6 (`runs` indexes and 180-day TTL, `run_cache` with 30-day TTL); the site's database role can write `run_cache`.
- Solver image (`apps/solver/Dockerfile`, OSS CAD Suite 2026-10-01, non-root) and `ContainerRunner`: a fresh container per job with no network, read-only root, CPU, memory and process caps, no capabilities and no secrets. Container attack tests run in CI; the end-to-end suite runs real Drill runs against the solver.
- Solver (phase 3): the SVA engine from `formal-verify-backend` in `apps/solver`, hardened. Signed, scoped, short-lived service tokens; `POST /v1/jobs` and `GET /v1/jobs/{id}` with UUIDv4 ids owned by the learner; Redis queue and worker; each job in its own process group with a hard time limit and no secrets; `.sby` files only from a checked template; UUID work folders removed only after a path check; file-reading code refused; no server paths in results. 13 hardening findings fixed with regression tests (ADR 0020). CI installs OSS CAD Suite and runs the real-solver tests.
- Question answers for learners with an active content entitlement: `/questions/[id]` and `GET /api/v1/questions/:id/answer`, paced and watermarked.
- Three least-privilege database users (site, answers reader, admin) with roles defined once in `infra/mongodb/roles.json`, applied on Atlas by `atlas-roles.mjs`, and checked by `pnpm db:verify-roles` (ADR 0019).

### Changed

- Redis outages are logged through the app logger (`redis_unavailable`) instead of an unhandled client event.
- Resume Builder: structured editor with live preview, two ATS-friendly templates, server-generated text PDF, save and delete.
- CV screening: drag-and-drop PDF or Word upload, rule-based ATS and formal verification keyword report with scores and fixes; files are read in memory and never stored; reports can be deleted.
- Migration 5: `resumes` and `cv_screenings` collections; Resume Builder and CV screening services opened.
- Drills in the CMS: `drills` and private `drill_private`, with depth and timeout checked against per-level caps.
- Lesson preview for admins (latest draft, `/preview/lessons/[id]`, "Preview" button in the admin).
- Security alerts: new-country sign-in, headless or scripted client, daily reading cap; reviewed in the admin.
- Industry Ready tab: `services` collection, `/industry-ready`, `GET /api/v1/services`; five services seeded locked (migration 4).
- 30-second in-memory cache for published lesson content, cleared on CMS changes.
- Demo course content: 30 original demo lessons across Basic, Intermediate and Advance (`content/import/demo-formal-verification.json`), published on the dev database over the placeholder slugs; each lesson says it is demo content.
- Question bank: companies, questions (with company tags, year and source note) and private answers in the CMS; public `/questions` page and `GET /api/v1/questions` with text search and filters. Answers are not served yet.
- Progress: `POST /api/v1/progress`, "Mark as done" on lessons, done marks on course outlines.
- Daily cap on lesson reads (150 a day per account) with an alert log event.
- Leak tests: no paid text in scripts of a locked page; no paid or member page prerendered.
- Migration 3: CMS-managed collections keep only Payload's own indexes.
- Content importer `pnpm content:import <file.json> [check]`: loads courses, modules and lessons through Payload, matched by slug so re-imports update in place and keep lesson URLs. Placeholder file with three draft courses of 10 modules each.
- Access grants in the admin: Support and Owner grant, extend or shorten a learner's content or tool window with a required reason; append-only, written with its audit entry in one transaction.
- `docs/roadmap/path-to-launch.md`: everything left before the first paying learner.
- Phase 2 content: Payload CMS at `/admin` (REST at `/cms-api`, admins only) with Author/Editor/Owner roles, drafts and versions; courses, modules and lessons with heading, paragraph, code, assertion, callout and diagram blocks.
- Learner side: public course outlines, lesson page and `GET /api/v1/lessons/:id` with pacing, per-read entitlement check, `no-store`, and visible plus invisible watermarks; sanitised inline SVG diagrams; `watermark_codes` trace table (migration 2).
- Two-factor sign-in: setup with QR code and backup codes, code step at sign-in, turn off with password.
- Sign-ins are written to the audit log. End-to-end tests clean up the invented data they create.
- ADR 0018: learners read published content directly; the CMS API is admin-only.

### Changed

- Heading levels are stored and rendered as text ("2", "3"), the way the CMS saves them; one schema now validates imports and stored lessons.
- Better Auth's built-in in-memory rate limiter is off; the Redis limiter in the API gate is the only one.
- The site's pages moved under `app/(site)` so the CMS can have its own root layout.

### Fixed

- The first CMS admin could not be created: counting admins inside Payload's transaction is refused by MongoDB.
- Lessons with headings failed to render: the CMS stores heading levels as text.

### Added (phase 1)

- Phase 1 foundations: pnpm monorepo (`apps/web`, `apps/solver`, `packages/shared`) with TypeScript strict, ESLint, Prettier, Vitest, Playwright, jscpd, knip, dependency-cruiser, ruff, vulture and pytest.
- `packages/shared`: level, role, entitlement and audit schemas; error codes; prices in paise; pure pricing, grant and access rules tested against rows 1-16 of the entitlement matrix.
- Web app: Next.js 16 with Better Auth (email and password with breached-password check, Google when configured, TOTP plugin), one active device per learner with a "signed in elsewhere" message, the shared API gate with a build-failing coverage test, Redis rate limits, nonce CSP and security headers, watermark on every signed-in page, landing, pricing and course outline pages.
- First migration: core collections, unique and TTL indexes. Least-privilege app role script.
- CI workflow (checks, end-to-end tests on a replica set, solver checks, dependency and secret scans) and a nightly backup workflow.
- Solver skeleton: service-token auth on every route, no CORS, no public API docs.
- ADR 0017 (proposed): nonce CSP renders every page per request.
- Project scaffolding: Claude Code configuration, architecture docs, ADRs, roadmap, runbooks and templates.
