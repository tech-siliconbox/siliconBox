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

## Status (2026-11-22)

Nothing is deployed yet. Everything runs locally against the development MongoDB Atlas cluster
and Upstash Redis; there will be one deployed environment, production (ADR 0032). Payments are
not built, and stay off until the phase 3 solver gate is met. Main is green on CI: 481 unit
tests, 61 end-to-end tests and 383 solver tests. Details and checklists: `docs/roadmap/`; what is
left before launch: `docs/roadmap/path-to-launch.md`.

### Built

| Area | What works |
| --- | --- |
| Foundations | pnpm monorepo; strict TypeScript; lint, format, duplicate, unused-code and layering checks; unit, end-to-end and solver tests; CI with four jobs (web, e2e, solver, security); exact dependency pins |
| Access rules | Prices, upgrades, content and tool windows as pure, tested rules (`pnpm test:entitlements`, every matrix row) |
| Accounts | Sign-up and sign-in by email and password (breached passwords refused) or Google; email verification and password reset through Resend; one device at a time; sign-ins audited |
| Protection | Every API route (47) through one gate: origin, session, rate limit, validation, entitlement. Also: nonce CSP and security headers; visible and invisible watermarks with a trace tool for Support; copy protection on paid pages; copyrighted content only inside its page (ADR 0027); readable addresses; AI crawlers refused |
| Database | Least-privilege users (site, answers reader, grader, admin), checked by `db:verify-roles`; 12 migrations |
| Content | Payload CMS at `/admin` (Author, Editor, Support, Owner) with drafts and versions; one page per module in the site's design (ADR 0024); HTML converter and JSON importer. **Basic** is final and imported (10 modules and the SVA cheatsheet). **Intermediate and Advance** show as coming soon: no outline, nothing served, not sold |
| Learning | Public outlines; Module 1 free once signed in; lessons paced and watermarked; progress |
| Drills | 8 Basic Drills published, checked by the publish gate (`pnpm drills:verify`); the Drill workspace runs them on the solver, graded against hidden designs (ADR 0021) |
| Course work | Graded assessments and capstone projects (ADR 0029); Performance page |
| Member area | Overview, Activity, Performance, Settings (data download and account deletion), Help, profile with photo |
| Question bank | Public, searchable list with company tags and years; answers for learners with active access |
| Industry Ready | Resume Builder: 5 resumes, 4 templates, PDF, docx and Markdown, imports. CV screening with job match. AI feedback is built but hidden until an Anthropic key is set (ADR 0030, proposed) |
| Praman (`/tool`) | The formal tool (ADR 0031), one sandboxed container per session. Menus, toolbar, property table, hierarchy, Tcl console and log. Visualize (waveform, why it fails, drivers, what-if). Reports: strength, coverage, proof core, equivalence. Run history, signal lists, resizable layout |
| Solver | Hardened engine: 21 findings fixed with tests; signed calls, Redis queue, one locked-down container per Drill run or Praman session |

### Not built yet

Payments (phase 4: products, checkout, Razorpay webhook, refunds, receipts and reminders), the
legal pages and consent, analytics, scheduled publishing (needs the host's cron), the solver's
status page. The always-on solver host, the attack test there, the load test and the outside
penetration test wait on hosting.

### Waiting on the founder

- A Razorpay business account.
- Terms, refund policy and privacy notice.
- Hosting accounts: Oracle Cloud for the solver (Oracle A1 with gVisor and 8 session slots is
  recommended, to confirm), Vercel, Cloudflare, and the production Atlas project; verify
  `siliconbox.in` in Resend.
- Budgets: the penetration test, the solver host, Vercel Pro from the first sale.
- The Intermediate and Advance content.
- The open questions in `docs/roadmap/README.md`.

