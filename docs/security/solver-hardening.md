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
