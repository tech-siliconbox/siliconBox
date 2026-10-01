# Hosting and cost by stage

Build on free tiers but plan to pay from the first sale. Vercel limits Hobby to non-commercial personal use and treats taking payments as commercial, so the live site needs Vercel Pro (from $20 a month per seat). Recheck vendor limits and prices before buying.

| Stage | Learners | Setup | Limits to watch |
| --- | --- | --- | --- |
| Build and test | You and testers | Vercel Hobby while nothing is sold; MongoDB Atlas free (Mumbai); Upstash Redis free; solver on Render free; Cloudflare free | Render free sleeps after 15 minutes; Atlas free has no backups |
| First paid launch | Up to a few hundred | Vercel Pro; Atlas free while data is under 512 MB with nightly `mongodump`; solver on an always-on paid instance | Atlas free: 100 operations a second; Upstash free: 500K commands a month |
| Growth | About 1,000 concurrent | Paid Atlas with backups; scaling solver runners; paid Redis; load test at 2x | p95 queue wait; database operations a second |

## Free-tier facts used

- Atlas free (M0): 512 MB, 100 operations a second, 500 connections, no backups, no Atlas Search, pauses after 30 days without connections; Mumbai (ap-south-1) supported.
- Upstash Redis free: 500K commands a month, so it cannot sit on every request.
- Render free: sleeps after 15 minutes, about a minute to wake, single instance, not for production.

Not yet priced: the always-on solver host and the growth-stage Atlas tier. The load test produces the sizing.
