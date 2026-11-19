# Hosting: free now, paid at launch

Decision: ADR 0022. Thresholds for later stages: `scaling.md`.

## Stage 0: build and invited learners (free)

| Piece | Service | Limits that matter | How the code stays inside them |
| --- | --- | --- | --- |
| Web, CMS, API | Vercel Hobby, region `bom1` | Non-commercial use only; function time and bandwidth caps | Pages render per request (ADR 0017); lesson content cached 30 s in memory |
| Database | Atlas M0, Mumbai | 512 MB storage, 500 connections, shared CPU, no backups, pauses when idle | Pool of at most 10 per client (`db/client.ts`); TTL on runs (180 days) and run cache (30 days) |
| Redis | Upstash free | Monthly command cap and a small memory cap | Worker blocks 120 s on the queue; rate limits are one command per check |
| Solver | Oracle Cloud Always Free, Arm (Ampere A1) | Card needed to sign up; capacity can run short; idle free VMs may be reclaimed | Docker image builds for arm64; `SOLVER_RUNNER=container`, gVisor; a small daily health job keeps it busy |
| Solver fallback | Render free web service | Sleeps after 15 minutes; one process, no container per job | Testing only, never for learners |
| DNS, TLS, WAF | Cloudflare free | Basic rules only | Admin host behind Cloudflare Access (free for small teams) |
| Email | Resend free plan (ADR 0028); `siliconbox.in` must be verified in Resend | Daily send cap | Only verification, receipts and alerts |
| Backups | None for now (dev data only) | Content is rebuilt from the import files | `infra/scripts/backup-mongo.sh` is kept; turn backups on before real learners' data exists |

### Redis budget (Upstash free)

Rough counts, to check against the dashboard each week:

- Solver worker idle: about 1,500 commands a day (one blocking wait and one health check every
  2 minutes).
- Each signed-in learner: about 60 commands an hour for the minute-by-minute session check,
  plus one to three per page or API call.
- Each Drill run: about 10 commands (queue, job record, status reads).

About 40 learners active for two hours a day stays within a typical free monthly cap. Above 70%
of the cap, move to pay-as-you-go (a few dollars at this size).

### Atlas M0 watch list

- Storage above 400 MB, or operations above 70 a second: move to M10. CV files count here: up to
  5 per learner, each at most 5 MB (most are under 300 KB).
- A cluster paused for inactivity shows as `querySrv ENOTFOUND`: resume it in Atlas.

## Stage 1: launch (first paying learner)

Required before payments open, whatever the traffic: Vercel Pro (ADR 0013), Atlas M10 with
continuous backups, Upstash pay-as-you-go, the solver on an always-on host with the deployed
attack test passed (phase 3 gate). Cloudflare stays on the free plan.

## Stage 2: growth

Follow `scaling.md`: more solver workers on queue depth, Atlas M20/M30 on metrics, object
storage for raw run logs.

## Database users in every environment

`siliconbox_app` (site), `siliconbox_answers` (answers only), `siliconbox_grader` (Drill
private parts only, ADR 0021) and `siliconbox_admin` (CMS and migrations). See
`infra/mongodb/README.md`.
