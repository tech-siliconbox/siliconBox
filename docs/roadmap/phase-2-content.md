# Phase 2: Content

Goal: editors can publish content and learners can read it safely.

## Tasks

- [x] Payload CMS inside `apps/web` with roles Author, Editor, Support, Owner
- [ ] Collections and Zod schemas: courses, modules, lessons, lesson_versions, drills, drill_private, questions, answers, companies, services
- [x] Block editor: heading, paragraph, code, assertion snippet, callout, diagram (SVG)
- [ ] Draft, preview as learner, schedule, publish, rollback
- [x] Content importer (`pnpm content:import`): JSON, matched by slug, through Payload (Markdown can be added if authors want it)
- [ ] Question bank: public list with company logo and name; private answers; text index search
- [x] Learning API: `GET /lessons/:id` with entitlement check, `no-store`, one lesson per response
- [x] Sequential release and opaque ids
- [x] Watermarks: visible tile and invisible text pattern on every paid view; private trace table
- [ ] Pacing limits and anomaly alerts (countries, headless signs, read bursts)
- [x] Manual entitlement grants by Support with a required reason and audit entry
- [ ] Industry Ready tab with service cards and admin-controlled status
- [ ] Resume Builder and CV screening (free for active learners), per-user storage and delete
- [x] Progress tracking
- [x] Test: no paid content in any bundle, static file, sitemap or feed

## Progress notes (2026-10-01)

- Payload CMS runs inside `apps/web` at `/admin`, REST API at `/cms-api` (admins only, ADR 0018). Roles enforced: Author saves drafts, Editor and Owner publish, Owner manages admins, Support and Owner grant access. The first admin becomes Owner (founder's Owner account created 2026-10-01).
- Access grants (2026-10-02): an append-only "Access grants" collection. Each grant replaces the learner's window for that kind and level (so it extends or shortens) and writes the audit entry in the same transaction. Unknown emails are refused. Covered by unit tests and the lesson end-to-end test.
- Placeholders (2026-10-02): `content/import/placeholders.json` imported three draft courses (Basic, Intermediate, Advance) with 10 modules and one lesson each; real content replaces them by re-using the slugs.
- Collections built: `admins`, `courses`, `modules`, `lessons` (versions and drafts; rollback through Payload's version history). Still to do: `drills`, `drill_private`, `questions`, `answers`, `companies`, `services`.
- Drafts: an unpublished draft never reaches learners (e2e test). Still to do: preview as a learner, scheduled publishing (needs the host's cron, deferred with Vercel).
- Learner side: public outlines (`/courses`, `/courses/[slug]`, titles only), lesson page `/learn/[id]` and `GET /api/v1/lessons/:id`. Each read is paced (12 a minute), checked against entitlements, `no-store`, and carries the visible and invisible watermark. Diagrams are sanitised inline SVG.
- Watermarks: visible tile on every signed-in page; invisible 32-bit code after the first word of every paragraph and callout, traced through the private `watermark_codes` table. Still to do: a trace tool for admins.
- Pacing: per-minute limit done. Still to do: daily cap, anomaly alerts, and the 30 to 60 second published-lesson memory cache.
- Gate status: an editor publishes a lesson and a signed-in learner reads it, watermarked, on one device; this passes end to end against the dev database. It is not yet shown on staging.

- Question bank (2026-10-02): `companies`, `questions` (drafts, company tags with year and internal source note) and `answers` (admins only) in the CMS; public `/questions` page and `GET /api/v1/questions` with text search, topic and company filters, 20 a page. Still to do: serving answers to entitled learners (waits on the answers database-user decision) and company logos (permission and storage).
- Progress (2026-10-02): `POST /api/v1/progress` (lesson must be published and readable by the learner); "Mark as done" on lessons; ✓ on the outline for signed-in learners.
- Pacing (2026-10-02): daily cap of 150 lesson reads per account (a starting value to tune), logged as an alert event when reached. Anomaly alerts still to do.
- Leak tests (2026-10-02): the locked lesson page's scripts never contain the paid text, and the build prerenders no lesson, API, account, course or question page. The site has no sitemap or feed.
- Migration 3: Payload owns the indexes of the collections it manages (`companies`, `answers`); Payload builds indexes before serving (`ensureIndexes`).

## Gate

An editor publishes a lesson and a learner reads it, watermarked, on one device.

## Docs to read

`docs/architecture/content-delivery.md`, `admin-cms.md`, `docs/security/watermarking.md`, `docs/product/`.
