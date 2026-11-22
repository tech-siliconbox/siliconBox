# Path to launch

Everything still needed before the first paying learner, as of 2026-11-22. The phase files hold
the detailed checklists; this page is the summary. **Dev** = engineering work; **Founder** = a
decision, account or content only the founder can supply.

## Before anything else

| Item | Who | Status |
| --- | --- | --- |
| Code on GitHub with CI (tests, scans) running | Founder + Dev | Done: `tech-siliconbox/siliconBox` (public by founder's choice), CI green |
| Environments | Founder | Decided: local development and production only, no staging (ADR 0032) |

## Phase 2: Content (done but for one item)

| Item | Who | Status |
| --- | --- | --- |
| CMS, roles, courses, modules, lessons, drafts and versions | Dev | Done |
| Course pages: one page per module in the site's design (ADR 0024) | Dev | Done |
| Content converter (`pnpm content:convert`) and importer (`pnpm content:import`) | Dev | Done |
| Support grants, extends or shortens access, audited | Dev | Done |
| Lesson pages, pacing, both watermarks, copy protection (ADR 0023) | Dev | Done |
| Course content (10 modules per course) | Founder | **Basic** final, converted and imported (2026-11-18). **Intermediate and Advance** show as coming soon (founder, 2026-11-21): no outline, nothing served, not sold until an editor opens them in the CMS |
| No demo content at launch | Dev | Intermediate and Advance still hold demo text on dev, hidden while they are coming soon. Production gets Basic and two empty coming-soon courses (the importer allows them) |
| Question bank: questions, companies, answers; public list, search, filters | Dev | Done |
| Question bank: serving answers to entitled learners | Dev | Done (answers-only database user, ADR 0019) |
| Industry Ready tab with admin-controlled services | Dev | Done |
| Resume Builder and CV screening, job match | Dev | Done. CV files: the newest 5 kept. AI feedback built, hidden until an Anthropic key is set (ADR 0030, proposed) |
| Member area: Overview, Activity, Performance, Settings, Help, profile | Dev | Done |
| Graded course work: assessments and capstones (ADR 0029) | Dev | Done |
| Progress tracking, preview as a learner, daily reading cap, anomaly alerts, lesson cache | Dev | Done |
| Test: no paid content in any bundle, sitemap or feed | Dev | Done |
| Watermark trace tool for admins | Dev | Done (`/admin-tools/trace`, Support and Owner) |
| Scheduled publishing | Dev | Waits on the host's cron (Vercel) |

## Phase 3: Solver (the riskiest part; payments wait for its gate)

| Item | Who | Status |
| --- | --- | --- |
| Hardening of the imported solver | Dev | Done: 21 findings fixed, each with a regression test (13 from the import, 8 for Praman sessions) |
| Job queue in Redis, isolated runner per job, quotas per level | Dev | Done: container per job, attack-tested locally; daily quota by level |
| Run API, result cache, polling, Drill workspace | Dev | Done |
| Basic Drills | Founder + Dev | Done: 8 published, each gate-verified |
| Grading against hidden designs (ADR 0021) | Dev | Done (grader database user created and verified) |
| Drill publish gate in CI (reference passes, every seeded bug fails) | Dev | Done (`pnpm drills:verify`) |
| Solver status page | Dev | Not built (queue position shows in the Drill workspace) |
| Smaller solver image | Dev | Not done (3.4 GB: OSS CAD Suite unpruned) |
| Always-on solver host, its network allow-list, and the attack test there | Founder + Dev | **The phase 3 gate.** Recommended: Oracle A1 with gVisor and 8 session slots (`load-test-results.md`); founder to confirm and open the account |

## Praman, the formal tool page (`/tool`, ADR 0031)

| Item | Who | Status |
| --- | --- | --- |
| The six plan PRs: decisions, solver port, data and API, page, deeper checks, load and launch readiness | Dev | Done (PRs #10 to #18) |
| Works like formal-verify's Praman: branding, property table, Visualize, the rest of the tool's experience | Dev | Done (PRs #19 to #21) |
| Capacity measured: about 95 MiB per open session, 1 CPU while proving | Dev | Done (`load-test-results.md`) |
| k6 load test of sessions | Dev | Skipped for now (founder, 2026-11-20) |
| Opens to learners | Founder + Dev | With the solver host above |

## Phase 4: Payments and launch (not started)

| Item | Who | Status |
| --- | --- | --- |
| Razorpay account verified | Founder | Not started |
| Checkout, signed webhook, refunds, entitlement writes | Dev | Pricing and upgrade rules done and tested; endpoints not started. A level whose course is coming soon is not sold |
| Email: verification and password reset (Resend, ADR 0028) | Dev | Built. At hosting, verify `siliconbox.in` in Resend (DNS records) and set `EMAIL_FROM` to an address on it |
| Email: receipts, new-device alerts, expiry reminders | Dev | Not started (same provider) |
| Vercel Pro, Cloudflare (WAF, Access + MFA on admin), production | Founder + Dev | Deferred |
| Database: dedicated Mumbai cluster, least-privilege users | Founder + Dev | Dev done (`siliconbox-dev`, ap-south-1; site, answers reader, grader and admin users verified). Production: its own Atlas project, created at launch, migrations and roles from CI |
| Backups to off-cluster storage, one encrypted restore drill | Founder + Dev | Off until launch (ADR 0022); script kept |
| Terms (no-sharing clause), refund policy, privacy notice and DPDP consent | Founder (lawyer) + Dev | Not started. Data download and account deletion are built. The privacy notice must name Anthropic if AI feedback is turned on |
| Analytics and Drill pass rates | Dev | Not started |
| Load test at 2x, outside penetration test, `/release-check` | Founder + Dev | Not started; on production before it opens to learners (ADR 0032) |
| Secrets pasted in chat rotated (Google OAuth secret, Resend key) | Founder | Before launch |

## Phase 5: Scale

Starts only when a stage threshold in `docs/architecture/scaling.md` is reached.

## Open decisions blocking engineering

See "Blockers and founder decisions" in `README.md` of this folder. The one that blocks code
soonest is the solver host: it closes the phase 3 gate, which phase 4 waits on.
