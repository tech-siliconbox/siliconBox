# Roadmap

Five phases, in order. Each depends on the last. **Payments open only after the phase 3 solver gate is met.** Durations are not set because they depend on team size.

Summary of everything left before launch: [path-to-launch.md](path-to-launch.md).

| Phase | Name | Gate to finish |
| --- | --- | --- |
| [1](phase-1-foundations.md) | Foundations | Sign-in, roles and backups work in production, before learners (ADR 0032) |
| [2](phase-2-content.md) | Content | An editor publishes a lesson and a learner reads it, watermarked |
| [3](phase-3-solver.md) | Solver (riskiest) | The runner passes an attack test before payments open |
| [4](phase-4-payments-launch.md) | Payments and launch | Load test at 2x and an outside penetration test are clear; Vercel Pro live |
| [5](phase-5-scale.md) | Scale | Triggered by a stage threshold from `docs/architecture/scaling.md` |

## Current phase

As of 2026-11-22:

- **Phase 3 (in progress):** everything that can be built without a host is done:
  - the solver, with 21 hardening findings fixed with tests;
  - the run API and a container per run;
  - the Drill workspace, the publish gate, and grading against hidden designs.

  The gate needs the always-on solver host, the network allow-list there, and the attack test
  against the deployed runner.
- **Phases 1 and 2:** done in code. Phase 1's gate waits on production (there is no staging,
  ADR 0032). Phase 2 has scheduled publishing left, which needs the host's cron.
- **Content:** only Basic is final; Intermediate and Advance show as coming soon.
- **Praman** (`/tool`, ADR 0031) is built: all six plan PRs and the rest of the tool's
  experience. It opens to learners with the solver host. The load test and host recommendation
  are in `load-test-results.md`.
- **Phase 4 (payments)** has not started. By the rule above it follows the phase 3 gate,
  unless the founder waives that gate, as phase 1's was.

## Blockers and founder decisions

- [ ] Team size and start date (sets the calendar)
- [ ] Approve Vercel Pro from the first paid sale
- [ ] Razorpay business account opened and verified
- [ ] Budget for a third-party penetration test and an always-on solver host (recommended: Oracle A1 with gVisor and 8 session slots, `load-test-results.md`)
- [ ] Company logos: ask permission, or launch with names only
- [ ] Industry Ready: order of building interview prep, coaching and mock interviews
- [ ] Legal documents: terms (with no-sharing clause), refund policy, privacy notice
- [ ] GST registration timing
- [ ] Course content and questions written, owned and ready to import (Basic done; Intermediate and Advance coming soon, founder 2026-11-21)
- [x] First free lesson: free for signed-in learners, as the test matrix says (founder, 2026-11-18)
- [ ] Buying a lower level while a higher one is active (code refuses it for now)
- [x] How the server reads `answers`: a separate answers-only database user (ADR 0019, 2026-10-02)
- [ ] If Redis is down, should any routes stay open (code refuses every gated call for now)
- [ ] Approve ADR 0017 (nonce CSP means public pages are not cached at the edge)
- [x] Backups: none while the database holds only development data; turn on before real learners' data (ADR 0022)
- [x] Environments: production only, no staging (founder 2026-11-21, ADR 0032)
- [x] Hosting until launch: free tiers (ADR 0022, `docs/architecture/hosting.md`); Vercel Pro and Atlas M10 at the first sale

## How to work a phase

`/start-phase <n>`, then `/next-task`. Tick boxes here as tasks finish. Record hard-to-reverse choices as ADRs. Update `CHANGELOG.md`.
