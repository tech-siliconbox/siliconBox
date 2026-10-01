# SiliconBox

A paid learning platform for formal verification: lessons, hands-on Drills and an embedded formal tool. Live at siliconbox.in (planned).

## Start here

1. `CLAUDE.md` holds the rules for anyone (human or Claude Code) changing this repo.
2. `docs/README.md` indexes every document.
3. `docs/roadmap/README.md` says what to build and in which order.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js + Payload CMS: public site, learning API, admin |
| `apps/solver` | FastAPI formal-tool service and isolated runner image |
| `packages/shared` | Zod schemas, entitlement rules, constants |
| `content/` | Markdown sources for courses, questions and companies |
| `docs/` | Architecture, security, product, design, roadmap, runbooks, legal |
| `infra/` | Environment and deployment notes |
| `.claude/` | Claude Code rules, subagents, commands and skills |

## Status (2026-10-02)

Nothing is deployed yet; everything runs locally against the development MongoDB Atlas database
and Upstash Redis. Payments stay disabled until the phase 3 solver gate is met. Details and
checklists: `docs/roadmap/`.

### Built

| Area | What works |
| --- | --- |
| Foundations | pnpm monorepo; strict TypeScript; lint, format, duplicate, unused-code and layering checks; unit and end-to-end tests; CI workflow |
| Access rules | Prices, upgrades, content and tool windows as pure, tested rules (entitlement matrix rows 1 to 16) |
| Accounts | Sign-up and sign-in (breached passwords refused), Google when configured, two-factor with backup codes, one device at a time with a "signed in elsewhere" message, sign-ins audited |
| Protection | Every API route through one gate (origin, session, rate limit, validation, entitlement), nonce CSP, security headers, visible and invisible watermarks |
| Content | Payload CMS at `/admin` with Author, Editor, Support and Owner roles, drafts and versions; courses, modules and lessons with six block types; JSON importer; 3 demo courses with 10 modules each (original demo text, to be replaced by the real content) |
| Support | Grant, extend or shorten a learner's access in the admin, with a reason, audited |
| Learning | Public course outlines; lesson page and API that serve published lessons only to entitled learners, paced (per minute and per day) and watermarked; progress marks |
| Question bank | Public, searchable list with company tags and years; answers written in the CMS (serving them waits on a decision) |
| Solver | Skeleton only: service-token auth, no public docs; hardening is phase 3 |

### In progress (phase 2)

Serving question answers, Drills in the CMS, preview as a learner, the Industry Ready tab and
anomaly alerts. Full list of
what is left before launch: `docs/roadmap/path-to-launch.md`.

### Waiting on the founder

Vercel, Cloudflare and an email provider (deferred), backup storage choice, a least-privilege
Atlas user, course content, and the open questions in `docs/roadmap/README.md`.
