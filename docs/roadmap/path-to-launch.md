# Path to launch

Everything still needed before the first paying learner, as of 2026-10-02 (updated after the question bank and progress work). The phase files hold
the detailed checklists; this page is the summary. **Dev** = engineering work; **Founder** = a
decision, account or content only the founder can supply.

## Before anything else

| Item | Who | Status |
| --- | --- | --- |
| Code on GitHub with CI (tests, scans) running | Founder + Dev | Done: `tech-siliconbox/siliconBox` (public by founder's choice), CI green |

## Phase 2: Content (in progress)

| Item | Who | Status |
| --- | --- | --- |
| CMS, roles, courses, modules, lessons, drafts and versions | Dev | Done |
| Content importer (`pnpm content:import`, JSON) and 30 placeholder modules | Dev | Done |
| Support grants, extends or shortens access, audited | Dev | Done |
| Lesson page and API, pacing, both watermarks | Dev | Done |
| Course content (10 modules per course) | Founder | In preparation |
| Demo content in the dev database: 30 original demo lessons (titles end in "(demo)") stand in until the real content is imported over the same slugs; none may remain at launch | Founder + Dev | Demo published on dev |
| Question bank: questions, companies, answers in the CMS; public list, search, filters | Dev | Done |
| Question bank: serving answers to entitled learners | Dev | Waits on the answers database-user decision |
| Drills in the CMS (starter code, private solution and bugs) | Dev | Not started |
| Industry Ready tab; Resume Builder and CV screening | Dev | Not started; CV storage needs a decision (founder chose MongoDB-only for now) |
| Progress tracking | Dev | Done |
| Preview as a learner; scheduled publishing | Dev | Not started; scheduling needs the host's cron |
| Daily reading cap | Dev | Done (150 a day, to tune) |
| Anomaly alerts, lesson memory cache | Dev | Not started |
| Test: no paid content in any bundle, sitemap or feed | Dev | Done |
| Watermark trace tool for admins | Dev | Not started |

## Phase 3: Solver (the riskiest part; payments wait for its gate)

| Item | Who | Status |
| --- | --- | --- |
| Bring in `formal-verify-backend` and fix its eight security findings, each with a test | Dev | Not started; needs repo access |
| Job queue in Redis, isolated runner per job, quotas per level | Dev | Not started |
| Run API (`POST /drills/:id/runs`, `GET /runs/:id`), result cache, polling | Dev | Not started |
| Drill workspace (editor, output, waveform) from `formal-verify-frontend` | Dev | Not started; needs repo access |
| Drill publish gate in CI (reference passes, every seeded bug fails) | Dev | Not started |
| Always-on solver host and an outside attack test | Founder + Dev | Not started; budget needed |

## Phase 4: Payments and launch

| Item | Who | Status |
| --- | --- | --- |
| Razorpay account verified | Founder | Not started |
| Checkout, signed webhook, refunds, entitlement writes (pricing rules already done and tested) | Dev | Rules done; endpoints not started |
| Email provider: verification, receipts, new-device alerts, expiry reminders | Founder + Dev | Deferred |
| Vercel Pro, Cloudflare (WAF, Access + MFA on admin), staging and production | Founder + Dev | Deferred |
| Dedicated Mumbai cluster | Founder | Done (`siliconbox-dev`, ap-south-1) |
| Least-privilege Atlas app user | Founder + Dev | Not started: create the `siliconboxApp` role and user in Atlas |
| Backups to off-cluster storage, one encrypted restore drill | Founder + Dev | Script ready; storage not chosen |
| Terms (no-sharing clause), refund policy, privacy notice and DPDP consent, export and delete | Founder (lawyer) + Dev | Not started |
| Analytics and Drill pass rates | Dev | Not started |
| Load test at 2x, outside penetration test, `/release-check` | Founder + Dev | Not started |
| No demo content left: no title ends in "(demo)" | Dev | Check at release |

## Phase 5: Scale

Starts only when a stage threshold in `docs/architecture/scaling.md` is reached.

## Open decisions blocking engineering

See "Blockers and founder decisions" in `README.md` of this folder. The ones that block code
soonest: how the server reads `answers` (question bank), where CVs are stored (Industry Ready),
and backup storage.
