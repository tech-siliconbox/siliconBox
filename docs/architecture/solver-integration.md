# Solver integration

The formal tool is a private service. Only the SiliconBox backend calls it. The browser never talks to formalverify.xyz or the Render backend.

Source repos: `gk2work/formal-verify-backend` (FastAPI) becomes `apps/solver`; `gk2work/formal-verify-frontend` components (editors, waveform view) are reused as a library inside the Drill page, not an iframe.

## A Drill run

1. Learner presses Run. Browser sends only their code: `POST /api/v1/drills/:id/runs`.
2. Server checks login, tool entitlement, daily run quota and size limits, then attaches the Drill's own top module, mode, depth and solver. The learner cannot choose these.
3. Job goes on the queue; a run id returns at once.
4. A runner executes the solver in a sandbox and stores the result.
5. Browser polls `GET /runs/:id` every 1 to 2 seconds (back off 1 s, 2 s, 5 s) and draws status, log and waveform.
6. Identical code for the same Drill is answered from `run_cache`, keyed by a hash of design, properties and settings.

## Result shape

`status` (PASS, FAIL, TIMEOUT, ERROR), elapsed time, output, assertion, failure cycle, counterexample trace as JSON. Each assert and cover is checked on its own and reported with its own status, step and trace. Exact fields: `apps/solver/CLAUDE.md`; design: ADR 0020.

## Where it runs

| Stage | Host |
| --- | --- |
| Build and test | Render free (sleeps after 15 minutes; testing only) |
| First paid launch | Always-on paid instance |
| Growth | Runners with one container per job; gVisor or Firecracker (Modal, Fly Machines or Cloud Run jobs) |

The Dockerfile with OSS CAD Suite can be the job image. Runner limits: no network, read-only root, CPU, memory and time caps.

## Quotas

Basic gets fewer runs a day than Advance. Each run has a hard timeout and depth cap set per level.

## Backpressure

When the queue is long the UI shows the learner's position instead of failing.

## Fixes required first

See `docs/security/solver-hardening.md`. Payments stay off until these pass.
