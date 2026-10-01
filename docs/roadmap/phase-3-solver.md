# Phase 3: Solver (riskiest)

Goal: a safe, isolated formal tool. No learner pays until this gate is met.

## Tasks

- [x] Import `formal-verify-backend` into `apps/solver` (engine only: no AI code, no PDFs)
- [x] Reproduce each finding in `docs/security/solver-hardening.md` with a test (13 findings, 87 tests)
- [x] Fix all eight findings; update the Status column (plus five found on import)
- [ ] Service-to-service auth (signed token) and network allow-list; remove public access and open CORS (done except the allow-list, which is set at the host)
- [x] Persisted jobs, UUIDv4 ids, results owned by user; remove `/run-sync` for learners
- [ ] Split the assertion generator out of the solver image; minimal image (generator left out; image not built yet)
- [ ] Queue in Redis; runner per job with no network, read-only root, limits; gVisor or Firecracker (queue and process-per-job runner done; container runner next, needs Docker)
- [ ] `POST /drills/:id/runs` and `GET /runs/:id` with tool entitlement, quotas, size limits and server-set Drill settings
- [ ] `run_cache` by content hash; polling backoff (1 s, 2 s, 5 s)
- [ ] Queue position in the UI; status page
- [ ] Drill workspace: editors and waveform view reused from `formal-verify-frontend` as a library
- [ ] Publish gate: reference PASS and each seeded-bug variant FAIL on the real solver, in CI with a fixture Drill
- [ ] Attack test against the deployed runner (path traversal, config injection, endless run, unauthenticated call)

## Progress

2026-10-02: engine imported and hardened, 13 findings fixed with tests, signed-call API,
Redis queue and worker running jobs end to end on the dev Upstash (ADR 0020). CI installs OSS
CAD Suite so the real-solver tests run there. Next: container runner and image, the web app's run
API, the Drill workspace.

## Gate

All findings Fixed with regression tests and the attack test passes. Only then start phase 4.

## Docs to read

`docs/architecture/solver-integration.md`, `docs/security/solver-hardening.md`, `.claude/rules/solver.md`.
