# apps/solver

FastAPI service around OSS CAD Suite (Yosys and SymbiYosys). Private: only the SiliconBox backend calls it.

Origin: `gk2work/formal-verify-backend`. Do not ship it as it is; fix the findings first.

Read before editing: `../../docs/security/solver-hardening.md`, `../../docs/architecture/solver-integration.md`, `../../.claude/rules/solver.md`.

## Must stay true

- No unauthenticated route. No wildcard CORS. Signed service token on every call.
- Work folders are server-generated UUIDs; resolved paths are checked before any delete.
- `.sby` files come from a fixed template; `mode` and `solver` are allow-listed; `top_module` is validated.
- `timeout` and `depth` are set by the server per level. Praman sessions (ADR 0031): the learner chooses within the ceilings the web app sends with each signed call, and the solver's own ceilings in `app/limits.py` still apply.
- Jobs are persisted; ids are UUIDv4; results belong to a user.
- No synchronous run endpoint for learners.
- No RAG or LLM packages in this image.

## Layout

```
app/main.py         API: /v1/health, POST /v1/jobs, GET /v1/jobs/{id} (thin)
app/session_api.py  API for Praman sessions: /v1/sessions/{id} (open, read, requests, replies, close)
app/auth.py         signed, scoped, short-lived service tokens (ADR 0020)
app/store.py        Redis job records and queue
app/worker.py       takes jobs and hands them to a runner
app/runners.py      LocalRunner and ContainerRunner; isolation_flags: every container's flags
app/session_store.py  Praman sessions in Redis: records, waiting line, request/reply relay
app/supervisor.py   holds a host's open sessions: opens, relays, heartbeats, closes when idle
app/session_runners.py  one process (dev) or container (production) per open session
app/file_access.py  file system tasks and `include learner code may not use (#10, #20)
app/job_runner.py   sandbox entry: job JSON on stdin, result JSON on stdout
app/gate.py         Drill publish gate (command line, for authors and CI)
app/pipeline.py     lower SVA, check each statement on its own, build the result
app/workspace.py    the only place work folders are named, made and removed
app/process.py      run a tool as a process group; kill the group on timeout
app/limits.py       ceilings and allow-lists
app/engine/         imported SVA parser, lowering, project generator, VCD reader;
                    sby_template.py is the only writer of .sby files (Drills)
app/praman/         Praman, the formal tool page's engine (ADR 0031), ported from formal-verify
                    1bfa69ba: session, commands, Tcl host, services/ (sva/), engine/.
                    SiliconBox's own modules there: host.py (the container's entry point),
                    protocol.py, operations.py, ceilings.py, store.py (the outbox)
tests/              pytest; one or more regression tests per hardening finding;
                    tests/praman/ holds Praman's ported tests
Dockerfile          solver image: API, worker and per-job runner (OSS CAD Suite, non-root)
```

Run locally: `pnpm --filter @siliconbox/solver dev` (API on 127.0.0.1:8001, a worker and a session
supervisor). It reads `apps/solver/.env.local` (`SOLVER_SIGNING_KEY`, same as the web app's, and
`REDIS_URL`). Jobs and Praman sessions run as local process groups by default; with
`SOLVER_RUNNER=container` each job and each open session runs in a container from
`SOLVER_RUNNER_IMAGE` (build it with `docker build -t siliconbox-solver:dev apps/solver`).
`SOLVER_SESSION_SLOTS` sets how many sessions a host holds open (default 2).

## Praman sessions (ADR 0031)

- The web app opens a session with `PUT /v1/sessions/{id}` (the learner's ceilings and, to reopen,
  its last save); it waits in line for a slot. `POST /v1/sessions/{id}/requests` carries every
  other request (`app/praman/protocol.py`); a reply slower than 20 s is read later from
  `GET /v1/sessions/{id}/replies/{requestId}`. Scope `sessions`; another learner's session is 404.
- The supervisor relays requests to the session's process: one Envelope per line on stdin, one
  `{id, reply}` per line on stdout. The host answers opening and closing in order, everything
  else on worker threads.
- The solver has no database: each poll hands the outbox (the session's save, run records and
  traces up to 2 MB) and the engine seconds used to the web app, which keeps them in MongoDB and
  counts the seconds against the learner's proof minutes. A closed session's last records stay
  in `GET /v1/sessions/{id}` (`final`) for a day.
- Ceilings: `app/praman/ceilings.py` is consulted where engines start. Never start an engine
  process except through `services/proc.run_tree`, which caps and counts it.
- Ported code keeps formal-verify's layout (not reformatted; style rules relaxed in
  `pyproject.toml`) so upstream changes can be compared. Its deletes go through
  `app/workspace.py`; its file names come from the session id the protocol restricts.

Result shape (camelCase on the wire): status (PASS, FAIL, TIMEOUT, ERROR), elapsedSeconds,
depthReached, checks (name, kind, status, step, message, trace), failedCheck, failureCycle,
message, log.

## Writing Drill properties for this engine

The open-source flow lowers SVA to plain Verilog. Declare the properties module's ports with
their widths (`input logic [3:0] count`), or multi-bit signals are read as 1 bit. Ports bind to
the design by name, so only the design's ports are visible. Helper logic in the properties
module (wires, registers, `always` blocks) is kept as written, so a checker can model internal
behaviour from the ports. A `cover` must name a `property`; an inline expression is not
lowered. `sig[->N] ##K expr` after `|=>` or `|->` is supported. If any statement uses SVA the
engine cannot lower yet, the run stops with an ERROR naming it (never a PASS that skipped a
check). `include and file system tasks are refused.

Publish gate: `python -m app.gate <content import file.json>` (`pnpm drills:verify`) runs every
Drill's reference solution, reference design, bug variants and starter on the real solver.
