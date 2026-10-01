# 0018. Learners read published content directly; the CMS API is admin-only

- Status: Accepted
- Date: 2026-10-01

## Context

Payload CMS writes courses, modules and lessons to MongoDB and exposes its own REST API. Paid
lesson text must only leave the server after our session, entitlement and pacing checks, and
learners must never see unpublished drafts.

## Decision

- Payload's REST API is mounted at `/cms-api` (not `/api`), apart from the gated `/api/v1`.
  Every Payload collection requires a signed-in admin, so learners cannot use it.
- The learner side reads the main `courses`, `modules` and `lessons` collections through our
  own repository (`src/db/content.ts`) with the app database user, filtered to
  `_status: 'published'`. Payload keeps drafts of an already-published document only in its
  `_<collection>_versions` collections, so the main collection always holds the published text.
- Lessons are addressed by a random `publicId` (UUID), never the database id.

## Consequences

Learner reads stay one aggregation query and never depend on Payload's access layer. The app
database user needs read-only access to the three content collections. If Payload ever changes
how it stores drafts, the "drafts stay hidden" end-to-end test (`e2e/lessons.spec.ts`) fails.
