# Privacy and DPDP checklist

- [ ] Privacy notice: what is collected (account, purchases, progress, runs, CVs), why and for how long
- [ ] Consent at sign-up and for optional analytics
- [x] Data export and deletion from Settings (2026-11-19)
- [x] Deletion keeps only the order and audit records the law requires (plus security alerts and admin grant records, which the site cannot change; see `docs/architecture/data-model.md`)
- [ ] CVs: stored per user, deletable, not used for anything else
- [ ] Processors listed: Vercel, MongoDB Atlas, Cloudflare, Razorpay, email and analytics providers
- [ ] Data kept in India where feasible (Atlas Mumbai)
- [ ] Breach notification steps in `docs/runbooks/account-takeover-or-leak.md`
- [ ] Contact for privacy requests
