# Roadmap

Five phases, in order. Each depends on the last. **Payments open only after the phase 3 solver gate is met.** Durations are not set because they depend on team size.

Summary of everything left before launch: [path-to-launch.md](path-to-launch.md).

| Phase | Name | Gate to finish |
| --- | --- | --- |
| [1](phase-1-foundations.md) | Foundations | Sign-in, roles and backups work in staging |
| [2](phase-2-content.md) | Content | An editor publishes a lesson and a learner reads it, watermarked |
| [3](phase-3-solver.md) | Solver (riskiest) | The runner passes an attack test before payments open |
| [4](phase-4-payments-launch.md) | Payments and launch | Load test at 2x and an outside penetration test are clear; Vercel Pro live |
| [5](phase-5-scale.md) | Scale | Triggered by a stage threshold from `docs/architecture/scaling.md` |

## Current phase

Phase 2 (in progress). Phase 1 code is done; its gate waits on staging (Vercel, deferred by the founder), and the founder asked to continue. See the progress notes in each phase file.

## Blockers and founder decisions

- [ ] Team size and start date (sets the calendar)
- [ ] Approve Vercel Pro from the first paid sale
- [ ] Razorpay business account opened and verified
- [ ] Budget for a third-party penetration test and an always-on solver host
- [ ] Company logos: ask permission, or launch with names only
- [ ] Industry Ready: order of building interview prep, coaching and mock interviews
- [ ] Legal documents: terms (with no-sharing clause), refund policy, privacy notice
- [ ] GST registration timing
- [ ] Course content and questions written, owned and ready to import
- [ ] First free lesson: the access model says free for everyone, the test matrix says sign-in required (code follows the matrix for now)
- [ ] Buying a lower level while a higher one is active (code refuses it for now)
- [ ] How the server reads `answers` when the app database user cannot (likely a separate read-only user)
- [ ] If Redis is down, should any routes stay open (code refuses every gated call for now)
- [ ] Approve ADR 0017 (nonce CSP means public pages are not cached at the edge)
- [ ] Backup storage (proposed: encrypted GitHub Actions artifacts, 30 days)
- [ ] Vercel, Cloudflare and email provider: deferred on 2026-10-01

## How to work a phase

`/start-phase <n>`, then `/next-task`. Tick boxes here as tasks finish. Record hard-to-reverse choices as ADRs. Update `CHANGELOG.md`.
