# Praman sessions (the formal tool page)

Symptoms: learners wait long on "Waiting for a free place on the formal tool", a session stays on
"Opening the session…", proofs take far longer than usual, or learners report their proof minutes
running out too fast.

## How it runs

- The solver's **supervisor** (`python -m app.supervisor`) holds up to `SOLVER_SESSION_SLOTS` open
  sessions on its host, each in its own container `siliconbox-session-<session id>` (1 CPU,
  1.5 GB, no network, read-only root; gVisor in production).
- More learners than slots wait in line, up to `MAX_WAITING_SESSIONS` (50); the page shows their
  place. A session with no command for 15 minutes and no proof closes, and its slot goes to the
  next in line. Closing hands its last records to the web app, which keeps them in MongoDB.
- A session's container exits when the supervisor stops (its input closes), and Docker removes it.
- Measured (2026-11-20, `docs/roadmap/load-test-results.md`): an open session uses about 100 MB
  and at most 1 CPU while it proves; CPU, not memory, limits how many a host holds.

## Checks

1. The supervisor is running: its log says `supervisor ready: N session slots`, then one line per
   session opened (`open (k of N slots)`) or closed (`closed: <reason>`).
2. The containers: `docker ps --filter name=siliconbox-session` shows one per open session.
   `docker stats --no-stream | grep siliconbox-session` shows their memory and CPU.
3. Host load: CPU near 100 % for long means proofs share the CPUs and run slower; learners' proof
   minutes count real engine time, so they then run out sooner.

## Fixes

- **Long waiting line, host has room** (CPU mostly below 70 %, memory free): raise
  `SOLVER_SESSION_SLOTS` and restart the supervisor at a quiet time (open sessions close and
  reopen from their last save on the next command).
- **Long waiting line, host is busy:** keep the slots; add a second solver host or a larger one
  (`docs/architecture/scaling.md`).
- **A session stuck opening:** check the supervisor is running and Docker answers
  (`docker info`). Restart the supervisor; learners' sessions reopen from their last save.
- **Containers left after a crash:** with the supervisor stopped, remove them with
  `docker rm -f $(docker ps -aq --filter name=siliconbox-session)`.
- **A learner's proof minutes:** each day's use is in Redis at `praman:proof-seconds:<user id>`
  (24 hours from the first proof). Support does not reset it by hand; after an outage, extend
  the learner's tool window with an audited grant (`grant-or-change-access.md`) instead.

## Never

- Read or copy a learner's files, log or traces from a container or the work folder; logs hold
  ids, timings and outcomes only (ADR 0031).
- Raise the per-level ceilings or the 1.5 GB cap to clear a backlog; those are product and
  security settings, changed only by an ADR.
