# Changelog

All notable changes are listed here, newest first. Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org) once a first release exists.

## [Unreleased]

### Added
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
