# SiliconBox: project instructions for Claude Code

SiliconBox (siliconbox.in) is a paid, course-driven formal-verification learning platform. Learners read lessons, practise on **Drills**, and run their code through our own formal tool. Paid content must never be bulk-crawlable or readable without a verified purchase.

Read this file first, then the doc the task points to. Details live in `docs/`; do not duplicate them here.

## Hard rules (never break these)

1. **Premium content leaves the server only after a per-request check of session and entitlement.** Never put lesson text, answers or drill solutions in a JS bundle, static page, sitemap, feed, search index or cache. See `docs/architecture/content-delivery.md`.
2. **Access comes only from a verified Razorpay webhook** (or an audited admin grant). Never trust the browser's payment "success" callback. See `docs/architecture/payments-and-entitlements.md`.
3. **The word "kata" is banned.** The exercise unit is a **Drill**, everywhere: code, UI, docs, DB, URLs. See `docs/product/glossary.md`.
4. **One active device per learner.** A second sign-in ends the first session.
5. **Every page a signed-in learner sees carries their watermark** (visible and invisible). See `docs/security/watermarking.md`.
6. **Learners never choose solver, depth, timeout or top module.** The server attaches the Drill's own settings. See `docs/architecture/solver-integration.md`.
7. **No video.** Lessons are text, code and inline SVG diagrams.
8. **Money is INR, no GST for now.** The tax rate is a setting, default 0. Prices are decided on the server only.
9. **Light theme only**, Geist and Geist Mono, tokens in `docs/design/formal-tokens-light.css`.
10. **No secrets in the repo, logs, client code or URLs.** Use the host secret store. See `.claude/rules/security.md`.

## Stack

Next.js (App Router, TypeScript) + Payload CMS in one app (`apps/web`), MongoDB Atlas (Mumbai), Better Auth (MongoDB adapter, TOTP), Razorpay, Redis for rate limits and the job queue, Cloudflare in front, separate sandboxed solver (`apps/solver`, FastAPI + OSS CAD Suite). Decisions and reasons: `docs/adr/`.

## Repository map

```
apps/web        Next.js + Payload CMS (site, learning API, admin)
apps/solver     FastAPI formal-tool service and runner image
packages/shared Zod schemas, entitlement rules, constants used by both
content/        Markdown sources for courses, questions, companies
docs/           Architecture, security, product, roadmap, runbooks, ADRs
infra/          Deploy and environment notes
.claude/        Rules, subagents, slash commands, skills for this repo
```

## Commands (keep this list true)

```
pnpm install            install all workspaces
docker compose up -d    local MongoDB (replica set) and Redis
pnpm --filter @siliconbox/solver setup   create the solver's Python venv
pnpm dev                run web and solver locally
pnpm typecheck          TypeScript across the repo
pnpm lint               ESLint + Prettier check
pnpm test               unit tests (Vitest)
pnpm test:entitlements  purchase/upgrade matrix, must always pass
pnpm test:e2e           Playwright against a local stack (build first)
pnpm db:migrate         run migrate-mongo migrations (needs MONGODB_URI_ADMIN)
pnpm naming:check       the banned word must not appear anywhere
pnpm dedupe:check       copy-paste detection (jscpd)
pnpm unused:check       unused files, exports, dependencies (knip)
pnpm deps:check         layering and circular imports (dependency-cruiser)
pnpm --filter @siliconbox/web cms:types   regenerate Payload types and admin import map
pnpm --filter @siliconbox/web db:verify-roles   prove each database user's access (after role changes)
```

Planned for phase 2: `pnpm content:import` (Markdown from `content/` into Payload).
Solver checks: `pnpm --filter @siliconbox/solver lint` and `... test`.

## Engineering standard: write like a senior engineer

Clean, readable code made of reusable parts, with no redundant code. Full rules: `.claude/rules/code-quality.md` and `docs/engineering/coding-standards.md`.

- **Search before you write.** Reuse or extend an existing function, hook, component, schema or constant. Check `docs/engineering/component-catalog.md`.
- **One source of truth.** Prices, caps, windows, roles, routes and messages live once in `packages/shared`. Derive types from Zod; never restate them.
- **No duplication, no dead code.** Extract on the second copy. Delete unused code. No commented-out code, no stray logging.
- **Small, focused units.** One job per function and per component; compose instead of adding boolean props.
- **Pure rules, thin edges.** Pricing and entitlement logic is pure and tested; I/O sits in thin wrappers.
- **Strict types and typed errors.** No `any`; one error-to-response mapper.
- **Stay in scope.** Do the task asked; note unrelated cleanup instead of mixing it in.
- Before finishing: re-read your diff for duplication, run the checks, run `/review-code`.

## Working agreements

- Work phase by phase from `docs/roadmap/`. Do not start a later phase until the earlier gate is met. Payments stay off until the solver gate (phase 3) passes.
- Validate every request body, query and parameter with a Zod schema from `packages/shared`. Unknown fields are rejected.
- Every route goes through the shared four gates: authenticate, authorise (per object), validate, rate-limit. Default is deny. A test fails the build if a route skips them.
- Never pass request data into a MongoDB query directly. Strip operators (`$ne`, `$where` and so on) through the schema.
- Schema changes are migrate-mongo scripts reviewed like code. Never edit production data by hand.
- Write a test with every change to entitlement, pricing or session logic.
- Small commits, conventional messages (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Do not commit unless asked.
- If a doc and the code disagree, say so and ask. Do not silently pick one. Record real decisions as a new ADR.

## Always-loaded facts

@docs/product/access-model.md
@docs/product/glossary.md

## Where to look

| Task | Read |
| --- | --- |
| Product rules, tiers, upgrades | `docs/product/access-model.md` |
| Data collections | `docs/architecture/data-model.md` |
| API routes and gates | `docs/architecture/api-design.md` |
| Sign-in, sessions | `docs/architecture/auth-and-sessions.md` |
| Solver fixes | `docs/security/solver-hardening.md` |
| What to build next | `docs/roadmap/README.md` |
| How to write code | `docs/engineering/coding-standards.md` |
| Reusable parts | `docs/engineering/component-catalog.md` |
| Terms and meanings | `docs/product/glossary.md` |
