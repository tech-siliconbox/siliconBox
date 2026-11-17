# 0022. Free tiers until launch, then scale by thresholds

- Status: Accepted
- Date: 2026-11-18

## Context

The founder asked to run on free plans for now and scale later. The app was designed for paid
hosting (ADR 0013: Vercel Pro from the first sale; Atlas M10; an always-on solver host). Free
plans have hard limits, and some forbid uses we will need later.

## Decision

Run every piece on a free plan until the first paying learner, as listed in
`docs/architecture/hosting.md`, with the code tuned to stay inside those limits:

- Web and CMS: Vercel Hobby, functions in Mumbai (`bom1`) beside the database.
- Database: MongoDB Atlas M0, Mumbai. Every client keeps a pool of at most 10 connections.
- Redis: Upstash free. The solver worker waits on the queue in 120-second blocks.
- Solver: Oracle Cloud Always Free Arm VM (Docker, one container per job, gVisor). Render free
  only as a test fallback: it sleeps and cannot run a container per job.
- DNS and edge: Cloudflare free. Email, when built: a free transactional plan.
- Backups: the nightly `mongodump` GitHub Action into an encrypted artifact kept 30 days (M0
  has no backups); it also keeps the cluster from pausing when idle.

Move each piece up when its threshold in `hosting.md` is reached, and in every case before
payments open: Vercel Pro (Hobby is for non-commercial use), Atlas M10 (backups and dedicated
capacity), Upstash pay-as-you-go.

## Consequences

- No hosting cost while the product is built and tried by invited learners.
- Limits to watch: Atlas M0 storage, operations and idle pausing; Upstash's monthly command cap;
  Oracle's capacity and reclaiming of idle free VMs; Vercel Hobby's terms.
- The free stack is not for paying learners. ADR 0013 still holds from the first sale.
