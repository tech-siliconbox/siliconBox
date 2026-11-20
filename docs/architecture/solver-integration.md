# Solver integration

The formal tool is a private service. Only the SiliconBox backend calls it. The browser never talks to formalverify.xyz or the Render backend.

Source repos: `gk2work/formal-verify-backend` (FastAPI) became `apps/solver` (October import, ADR 0020). The Drill page's editor and waveform view are SiliconBox components ported from `gk2work/formal-verify-frontend`, not an iframe or a library. Praman, the formal tool page, is ported from formal-verify at backend `1bfa69ba` and frontend `f20fdbf` (ADR 0031). Its UI is rebuilt in the site's design from the same SiliconBox components. The formal-verify repositories are read-only reference.

## A Drill run

1. Learner presses Run. Browser sends only their code: `POST /api/v1/drills/:id/runs`.
2. Server checks login, tool entitlement, daily run quota and size limits, then attaches the Drill's own top module, mode, depth and solver. The learner cannot choose these.
3. Job goes on the queue; a run id returns at once.
4. A runner executes the solver in a sandbox and stores the result.
5. Browser polls `GET /runs/:id` every 1 to 2 seconds (back off 1 s, 2 s, 5 s) and draws status, log and waveform.
6. Identical code for the same Drill is answered from `run_cache`, keyed by a hash of design, properties and settings.

## A Praman session (the tool page, ADR 0031)

The one place a learner chooses the top module, proof time and trace length (the exception to hard rule 6), always within the server's ceilings for their level. Drills never use this path.

1. The learner opens `/tool`. The browser calls only the web app's `/api/v1/tool/…` routes (four gates: tool and content windows, owner, schema, rate limit).
2. The web app calls the solver's `/sessions` API with a signed token carrying the learner and their level's ceilings. The supervisor starts one sandboxed **session container** for that session (same isolation as a job container, about 1.5 GB). If the host is full, the learner waits in line and sees their position.
3. Each command (a menu action or a line typed in the Tcl console) goes to the container on stdin; the answer comes back on stdout. Praman's session code runs inside: Tcl in safe mode, Yosys and its engines.
4. Every engine start obeys the ceilings and the learner's remaining proof minutes. Settings above a ceiling are lowered to it, with a line in the log.
5. The browser polls for log lines and proof progress (no SSE). The web app stores files, journal, results and traces in MongoDB; the solver keeps no database.
6. After 15 minutes with no command and no proof running, the container closes; its last records stay with the solver for the web app. The next command reopens the session from its last save: files, analysed sources, the elaborated design and results, as Praman restores sessions after a restart (Tcl variables are not kept).

One open session per learner. Proof minutes are counted from real engine time, separately from the Drill run quota. The solver's session API and protocol: `apps/solver/CLAUDE.md` (Praman sessions).

## Result shape

`status` (PASS, FAIL, TIMEOUT, ERROR), elapsed time, output, assertion, failure cycle, counterexample trace as JSON. Each assert and cover is checked on its own and reported with its own status, step and trace. Exact fields: `apps/solver/CLAUDE.md`; design: ADR 0020.

## Where it runs

| Stage | Host |
| --- | --- |
| Build and test | Render free (sleeps after 15 minutes; testing only) |
| First paid launch | Always-on paid instance |
| Growth | Runners with one container per job; gVisor or Firecracker (Modal, Fly Machines or Cloud Run jobs) |

The Dockerfile with OSS CAD Suite can be the job image. Runner limits: no network, read-only root, CPU, memory and time caps.

Praman sessions need a host that keeps containers running (Docker, or Fly Machines started per session) before the tool page opens to learners. Development and tests use Docker Desktop. Measured (2026-11-20, `docs/roadmap/load-test-results.md`): an open session uses about 100 MB and, while it proves, its 1-CPU cap, so CPU sets how many a host holds. Recommended, for the founder to confirm: the Oracle Cloud A1 host of ADR 0022 (4 OCPU, 24 GB) with gVisor and `SOLVER_SESSION_SLOTS=8`. Operating it: `docs/runbooks/praman-sessions.md`.

## Quotas

Basic gets fewer runs a day than Advance. Each run has a hard timeout and depth cap set per level. On the tool page the allowance is proof minutes a day per level (ADR 0031, `docs/product/access-model.md`).

## Backpressure

When the queue is long the UI shows the learner's position instead of failing. The tool page does the same when a host has no free session container.

## Fixes required first

See `docs/security/solver-hardening.md`. Payments stay off until these pass.
