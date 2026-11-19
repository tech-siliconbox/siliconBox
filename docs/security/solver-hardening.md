# Solver hardening (required before any paying learner)

Findings 1 to 8 came from reading `formal-verify-backend`; 9 to 13 were found while importing it
into `apps/solver` (2026-10-02). Each fix has a regression test in `apps/solver/tests`. Design:
ADR 0020.

| # | Finding | Risk | Fix | Status |
| --- | --- | --- | --- | --- |
| 1 | `project_name` from the request is joined onto the work folder and deleted with `shutil.rmtree` | Crafted name escapes the folder and deletes other directories | No request value names a path. UUID job folders made and removed only by `app/workspace.py`, which refuses paths outside the work root (including through symlinks) | Fixed: `test_isolation.py`, `test_pipeline.py`, `test_jobs_api.py` |
| 2 | `mode`, `solver` and `top_module` go into the `.sby` file unchecked | Injected lines could run Yosys commands | Allow-listed settings at the API; `.sby` built only by `app/engine/sby_template.py`, which checks every value again; fixed file names | Fixed: `test_sby_template.py`, `test_jobs_api.py` |
| 3 | `timeout` and `depth` come from the client | One user can hold a CPU for a long time | Only the web app sets them (from the Drill); solver ceilings in `app/limits.py`; one time budget per job; the whole process group is killed | Fixed: `test_isolation.py`, `test_pipeline.py` (endless solver), `test_jobs_api.py` |
| 4 | CORS is `*` with credentials | Any site can call the API from a visitor's browser | No CORS; only signed service calls | Fixed: `test_auth.py` |
| 5 | No authentication on any route | Anyone can run jobs on your compute | Short-lived HS256 tokens with issuer, audience, learner and scope on every route. Network allow-list at the host | Fixed in code: `test_auth.py`. Allow-list: at deploy |
| 6 | Jobs in an in-memory dict, short ids | Lost on restart, single instance, guessable | Jobs in Redis, UUIDv4 ids, each owned by a learner; other learners get 404 | Fixed: `test_jobs_api.py`, `test_worker.py` |
| 7 | `/run-sync` holds a request open | Ties up workers, proxy timeouts | Removed with every other old route; queue and poll only | Fixed: `test_jobs_api.py` |
| 8 | RAG and LLM packages in the solver image | Bigger attack surface, slow cold start | AI generator and debugger not imported; no AI packages in the solver's dependencies | Fixed: `test_isolation.py`. Minimal image: with the runner image |
| 9 | Responses include absolute server paths (project, logs, traces) | Reveals the server's layout | Results carry no paths; tool output is stripped of the work folder | Fixed: `test_pipeline.py` |
| 10 | Learner code can read runner files (`` `include ``, `$readmemh`, `$fopen`) | Reads files on the runner, echoed in errors | Refused before any tool runs; the runner holds no secrets | Fixed: `test_pipeline.py`, `test_isolation.py` |
| 11 | No size limit on uploaded code | Memory and disk exhaustion | 256 KB design, 64 KB properties, 1 MB job | Fixed: `test_jobs_api.py` |
| 12 | `/run` dropped the caller's top module | Wrong design proved | The Drill's top module is always used | Fixed: `test_pipeline.py` |
| 13 | The repository holds the IEEE 1800-2017 PDF and the SymbiYosys manual PDF | Copyright | Not imported into this repository | Fixed |

## Runner isolation target

One container per job; no network; read-only root; CPU, memory and time limits; gVisor or
Firecracker. Status: built. `ContainerRunner` starts a fresh container per job from the solver
image with `--network none --read-only`, tmpfs work and tmp folders, 1 CPU, 1 GB memory (no swap),
256 processes, `--cap-drop ALL`, `no-new-privileges`, user 65534, and no environment beyond the
work root; the container is removed by name after a timeout. gVisor: set
`SOLVER_CONTAINER_RUNTIME=runsc` on a host with gVisor installed. `tests/test_container_runner.py`
attacks a real container (network, root writes, fork bomb, memory hog, endless run, secrets) and
runs in CI. The attack test against the deployed runner waits for a host.

## Gate

Phase 3 is done only when every row is Fixed with a regression test and an attack test against the
deployed runner passes (path traversal, config injection, endless run, unauthenticated call).

## Praman sessions (the tool page, ADR 0031)

Findings 14 to 21 come from reading Praman in the formal-verify copy (backend `1bfa69ba`) for the
tool page. Rows 1 to 13 also hold for sessions: no request value names a path, signed calls only,
no paths in results, size limits.

| # | Finding | Risk | Fix | Status |
| --- | --- | --- | --- | --- |
| 14 | The browser calls Praman directly: CORS `*` with credentials, its own accounts, a bearer token in `localStorage` | Any site can call it from a visitor's browser; a stolen token is a session | Praman's routers, `auth.py` and stores are not ported. The browser calls only the web app (Better Auth cookie, four gates); the web app calls `/sessions` with signed tokens (as #4, #5) | Open (PR 2, PR 3) |
| 15 | The Tcl console runs learner scripts with `tclsh` on the server host | A safe-interpreter escape or a runaway script reaches the host | Tcl safe interpreter (no `exec`, `open`, `socket`, `file`, `cd`) with its own memory cap, inside the session container; `source` reads only the session's own files. Attack tests: interpreter escapes, endless loops, memory | Open (PR 2) |
| 16 | Yosys, the engines and the proof workers run on the host, fed by a folder queue on one machine | Learner code runs outside any sandbox | All of a session's work runs in its session container, with the same isolation as a job container; the supervisor never runs learner code | Open (PR 2) |
| 17 | The user sets the proof time limit (default 24 hours, any value), the trace length and the top module; what-if and drivers can go deeper than the trace length | One learner holds a CPU for hours | Ceilings per level, signed by the web app, plus the solver's absolute ceilings in `app/limits.py`, enforced where every engine starts. A proof's limit is also capped by the learner's proof minutes left | Open (PR 2) |
| 18 | A session stays open while anyone polls it, up to 4 hours idle | Open sessions use up a host | One open session per learner, a fixed number per host, idle close after 15 minutes, a waiting line with a length limit | Open (PR 2) |
| 19 | Every learner's session lives in one server process (`_sessions`) | A bug lets one learner reach another's session or files | UUIDv4 sessions owned by the learner in `sub`, others get 404 (as #6); one session per container | Open (PR 2) |
| 20 | `` `include `` and `source` read files by name; `$readmemh` and `$fopen` are not checked | Reads another session's files or the host's | File system tasks refused before any tool runs (as #10); names resolve only among the session's own files; a container holds one session's files and no secrets | Open (PR 2) |
| 21 | No size limits on session files, commands or traces | Memory, disk and database exhaustion | 1 MB of files per session, a size cap per command, 2 MB per trace, a capped log; checked by the web app and again by the solver (as #11) | Open (PR 2, PR 3) |

**Session containers:** started by the supervisor from the solver image with the same flags as job
containers (no network, read-only root, tmpfs work folder, user 65534, `--cap-drop ALL`,
`no-new-privileges`, process limit, gVisor where available). Each has 1 CPU and about 1.5 GB, and
lives while its session is open. Commands go in on stdin and results come out on stdout.

**Gate:** the tool page opens to learners only when rows 14 to 21 are Fixed with regression
tests, and an attack test against a session container passes. It covers Tcl escapes, memory,
endless scripts, proof ceilings, another learner's session and file reads.
