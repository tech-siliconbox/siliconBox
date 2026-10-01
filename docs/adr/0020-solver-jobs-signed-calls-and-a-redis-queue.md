# 0020. Solver: signed calls, a Redis queue and one process per job

- Status: Accepted
- Date: 2026-10-02

## Context

`formal-verify-backend` (now `apps/solver`) ran jobs inside the API process, kept them in memory
and trusted every request field. `docs/security/solver-hardening.md` lists the findings. The web
app must submit a learner's run, return at once and poll, and only the web app may call the
solver.

## Decision

- **Calls:** the web app signs a token per call (HS256 JWT with the shared `SOLVER_SIGNING_KEY`):
  issuer `siliconbox-web`, audience `siliconbox-solver`, `sub` = the learner, `scope` =
  `jobs:write`, `jobs:read` or `health`, lifetime at most 120 seconds. The solver has no CORS and
  no API docs. A network allow-list is added where the solver is hosted.
- **API:** `POST /v1/jobs` (202 with a UUIDv4 id and queue position) and `GET /v1/jobs/{id}`.
  A job belongs to the learner in `sub`; anyone else gets 404. No synchronous run route.
- **Queue and records:** Redis. One list (`solver:queue`), one record per job (`solver:job:{id}`)
  and the job's code (`solver:spec:{id}`), dropped when a worker takes the job. Records expire after
  24 hours; the web app keeps results it needs in MongoDB. A job still running past the longest
  allowed time is reported as lost. More than `MAX_QUEUE_LENGTH` waiting jobs gives 503.
- **Workers:** `python -m app.worker` takes one job at a time and runs it through a `Runner`.
  `LocalRunner` starts `python -m app.job_runner` as its own process group with a hard time limit
  and an environment holding only `PATH` and the work root: no Redis URL, no signing key. The
  job process reads the job on stdin and writes the result on stdout, so the whole pipeline
  (parsing, lowering, Yosys, solver) is inside the sandbox and is killed together.
- **Next:** a `ContainerRunner` with the same interface runs `app.job_runner` in a fresh container
  per job (no network, read-only root, CPU, memory and process limits, gVisor or Firecracker).
  Only the runner changes; the API, store and pipeline stay as they are.
- **Engine:** the SVA parser, lowering engine and project generator are kept from the original
  repository. The `.sby` file is built only by `app/engine/sby_template.py`; work folders are
  made and removed only by `app/workspace.py`. The AI assertion generator and debugger are not
  part of the solver.

## Consequences

The web app and the solver share one secret per environment (`SOLVER_SIGNING_KEY`). Results reach
the browser only through the web app's own routes. Redis carries learner code for the few
seconds a job waits; it is deleted when the job starts. Each idle worker issues one blocking
Redis command every 30 seconds.
