# infra

Environment and deployment notes. Nothing here holds secrets.

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | Vercel (Mumbai region) | Hobby while nothing is sold; Pro before the first sale |
| Database | MongoDB Atlas, Mumbai | Free to start; separate users per role |
| Redis | Upstash | Rate limits and job queue |
| Solver | Render free for testing; always-on paid host at launch; isolated runners later | Private; signed service token |
| Edge | Cloudflare | WAF, bot rules, Access + MFA for admin |
| Email | Resend or SES | Receipts, alerts, reminders |
| Analytics | PostHog or Plausible | Funnels and Drill pass rates |

MongoDB users and roles: `mongodb/`. Backup and restore scripts: `scripts/`.

Environment variable names are in `../.env.example`. Real values live only in each host's secret store. See `docs/architecture/hosting-and-cost.md` and `docs/runbooks/deploy.md`.
