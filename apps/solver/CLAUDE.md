# apps/solver

FastAPI service around OSS CAD Suite (Yosys and SymbiYosys). Private: only the SiliconBox backend calls it.

Origin: `gk2work/formal-verify-backend`. Do not ship it as it is; fix the findings first.

Read before editing: `../../docs/security/solver-hardening.md`, `../../docs/architecture/solver-integration.md`, `../../.claude/rules/solver.md`.

## Must stay true

- No unauthenticated route. No wildcard CORS. Signed service token on every call.
- Work folders are server-generated UUIDs; resolved paths are checked before any delete.
- `.sby` files come from a fixed template; `mode` and `solver` are allow-listed; `top_module` is validated.
- `timeout` and `depth` are set by the server per level.
- Jobs are persisted; ids are UUIDv4; results belong to a user.
- No synchronous run endpoint for learners.
- No RAG or LLM packages in this image.

## Layout

```
app/main.py         API: /v1/health, POST /v1/jobs, GET /v1/jobs/{id} (thin)
app/auth.py         signed, scoped, short-lived service tokens (ADR 0020)
app/store.py        Redis job records and queue
app/worker.py       takes jobs and hands them to a runner
app/runners.py      LocalRunner (process group, time limit, no secrets); ContainerRunner next
app/job_runner.py   sandbox entry: job JSON on stdin, result JSON on stdout
app/pipeline.py     lower SVA, check each statement on its own, build the result
app/workspace.py    the only place work folders are named, made and removed
app/process.py      run a tool as a process group; kill the group on timeout
app/limits.py       ceilings and allow-lists
app/engine/         imported SVA parser, lowering, project generator, VCD reader;
                    sby_template.py is the only writer of .sby files
tests/              pytest; one or more regression tests per hardening finding
Dockerfile          minimal runner image with OSS CAD Suite (next)
```

Run locally: `pnpm --filter @siliconbox/solver dev` (API on 127.0.0.1:8001 plus a worker). It reads
`apps/solver/.env.local` (`SOLVER_SIGNING_KEY`, same as the web app's, and `REDIS_URL`).

Result shape (camelCase on the wire): status (PASS, FAIL, TIMEOUT, ERROR), elapsedSeconds,
depthReached, checks (name, kind, status, step, message, trace), failedCheck, failureCycle,
message, log.

## Writing Drill properties for this engine

The open-source flow lowers SVA to plain Verilog. Declare the properties module's ports with
their widths (`input logic [3:0] count`), or multi-bit signals are read as 1 bit. A `cover`
must name a `property`; an inline expression is not lowered. `include and file system tasks
are refused.
