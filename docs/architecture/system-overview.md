# System overview

SiliconBox is a modular monolith plus one separate solver service. One rule drives the design: premium bytes leave the server only after a per-request check of who the learner is and what they bought.

```
Learner browser   Admin browser   Razorpay
        \              |            /
          Cloudflare edge (WAF, bot rules, rate limits; admin path behind Cloudflare Access + MFA)
                         |
   SiliconBox app: Next.js + Payload CMS (Vercel, Mumbai region)
     Public pages | Learning API (gate) | Admin (Payload) | Payments (webhook)
         |                    |                                  |
   MongoDB Atlas (Mumbai)   Redis (rate limits, job queue)   Solver runners (isolated, no network)
```

## Components

| Component | Role | Notes |
| --- | --- | --- |
| Cloudflare | WAF, bot scoring, rate limits; Cloudflare Access with MFA on admin | Blocks scripted scraping before the app |
| Next.js app | Public pages, learning API, payment webhook, admin host | Payload CMS runs inside it |
| Payload CMS | Content admin, drafts, versions, roles | Writes to the same MongoDB |
| MongoDB Atlas | All data | Mumbai region; free tier to start |
| Redis | Rate limits and the solver job queue | Not on every read |
| Solver service | FastAPI + OSS CAD Suite | Only the backend can call it |
| Runners | One sandbox per job | No network, read-only root, limits |
| Email | Receipts, new-device alerts, expiry reminders | Resend or SES |
| Analytics | Funnels, Drill pass rates | PostHog or Plausible |

## Boundaries

- Browsers talk only to Cloudflare and the app. They never reach the solver, the database or Redis.
- The app is the only caller of the solver runners, with a signed service token.
- Runners hold no learner data beyond the code being checked.
- Razorpay's webhook is the only path from payment to access (plus audited admin grants).

## Why a modular monolith

One deployable to run and debug. Only the risky, CPU-heavy part (the solver) is isolated. Split further only when a measured limit forces it, recorded as an ADR.

Related: `content-delivery.md`, `data-model.md`, `api-design.md`, `solver-integration.md`, ADRs 0001 to 0005.
