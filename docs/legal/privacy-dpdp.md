# Privacy and DPDP checklist

- [ ] Privacy notice: what is collected (account, purchases, progress, runs, CVs), why and for how long
- [ ] Consent at sign-up and for optional analytics
- [x] Data export and deletion from Settings (2026-11-19)
- [x] Deletion keeps only the order and audit records the law requires (plus security alerts and admin grant records, which the site cannot change; see `docs/architecture/data-model.md`)
- [x] Praman sessions and runs: the learner's own designs, scripts, runs and traces, kept 180 days after the session's last use, in the data download (without logs and traces) and deleted with a session, a run or the account (2026-11-20, ADR 0031)
- [x] CVs: stored per user (newest 5 files with their reports), deletable, not used for anything else; sent to the AI provider only with the learner's per-use agreement (2026-11-19, ADR 0030)
- [ ] Processors listed: Vercel, MongoDB Atlas, Cloudflare, Razorpay, email and analytics providers, and Anthropic for AI feedback (ADR 0030; the AI option stays off until this notice is published)
- [ ] Data kept in India where feasible (Atlas Mumbai)
- [ ] Breach notification steps in `docs/runbooks/account-takeover-or-leak.md`
- [ ] Contact for privacy requests
