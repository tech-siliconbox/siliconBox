# Phase 3: Solver (riskiest)

Goal: a safe, isolated formal tool. No learner pays until this gate is met.

## Tasks

- [x] Import `formal-verify-backend` into `apps/solver` (engine only: no AI code, no PDFs)
- [x] Reproduce each finding in `docs/security/solver-hardening.md` with a test (13 findings, 87 tests)
- [x] Fix all eight findings; update the Status column (plus five found on import)
- [ ] Service-to-service auth (signed token) and network allow-list; remove public access and open CORS (done except the allow-list, which is set at the host)
- [x] Persisted jobs, UUIDv4 ids, results owned by user; remove `/run-sync` for learners
- [ ] Split the assertion generator out of the solver image; minimal image (generator left out; image built, 3.4 GB: OSS CAD Suite unpruned)
- [x] Queue in Redis; runner per job with no network, read-only root, limits; gVisor or Firecracker (container per job built and attack-tested; gVisor is a setting, `SOLVER_CONTAINER_RUNTIME=runsc`, enabled on the host)
- [x] `POST /drills/:id/runs` and `GET /runs/:id` with tool entitlement, quotas, size limits and server-set Drill settings
- [x] `run_cache` by content hash; polling backoff (1 s, 2 s, 5 s) (constants shared; the workspace UI uses them)
- [ ] Queue position in the UI; status page (queue position shown in the Drill workspace; status page not built)
- [x] Drill workspace: editors and waveform view (built in the site: the reference frontend is no longer available locally, and its Monaco editor injects inline styles the nonce CSP refuses)
- [x] Publish gate: reference PASS and each seeded-bug variant FAIL on the real solver, in CI with a fixture Drill (`pnpm drills:verify`, `apps/solver/app/gate.py`; `tests/test_gate.py` runs in CI)
- [ ] Attack test against the deployed runner (path traversal, config injection, endless run, unauthenticated call)

## Progress

2026-10-02: engine imported and hardened, 13 findings fixed with tests, signed-call API,
Redis queue and worker running jobs end to end on the dev Upstash (ADR 0020). CI installs OSS
CAD Suite so the real-solver tests run there. Next: container runner and image, the web app's run
API, the Drill workspace.

2026-10-02 (later): solver image (OSS CAD Suite 2026-10-01, non-root) and a container per job:
no network, read-only root, 1 CPU, 1 GB, 256 processes, no capabilities, no secrets. Attack tests
in a real container (network, writes, fork bomb, memory hog, endless run, secrets) pass and run in
CI. Web run API: `POST /api/v1/drills/:id/runs`, `GET /api/v1/runs/:id`, daily quota by level,
idempotent submits, `run_cache`, migration 6; end-to-end test from browser to container. Next:
the Drill workspace page, then the publish gate.

2026-11-18: Drill workspace at `/drills/:id`: brief on the left (server-rendered, watermarked),
files on the right (design read-only, properties editable and kept in the browser), Run with
polling and queue position, per-property results with counterexample and cover traces drawn as
waveforms (tool bookkeeping hidden, each signal once). Reading a Drill needs the content window
for its level; running it also needs the tool window (`drillBrief` access, matrix note). Drills
are listed on the course outline. End-to-end test runs a real Drill from the page. Next: the
publish gate, then the host and the deployed attack test.

2026-11-18 (later): publish gate built and five Basic Drills (Modules 4, 8, 9) written from
the course's own designs, verified (24 checks on the real solver) and imported as drafts for
the founder's review. The engine now keeps helper logic in properties modules (it used to drop
everything but the SVA). ADR 0021 (proposed): grade runs against the hidden designs, so a
trivial checker cannot "solve" a Drill. Next: decide ADR 0021, the host and the attack test.

## Gate

All findings Fixed with regression tests and the attack test passes. Only then start phase 4.

## Docs to read

`docs/architecture/solver-integration.md`, `docs/security/solver-hardening.md`, `.claude/rules/solver.md`.
