# Phase 3: Solver (riskiest)

Goal: a safe, isolated formal tool. No learner pays until this gate is met.

## Tasks

- [ ] Import `formal-verify-backend` into `apps/solver`
- [ ] Reproduce each finding in `docs/security/solver-hardening.md` with a test
- [ ] Fix all eight findings; update the Status column
- [ ] Service-to-service auth (signed token) and network allow-list; remove public access and open CORS
- [ ] Persisted jobs, UUIDv4 ids, results owned by user; remove `/run-sync` for learners
- [ ] Split the assertion generator out of the solver image; minimal image
- [ ] Queue in Redis; runner per job with no network, read-only root, limits; gVisor or Firecracker
- [ ] `POST /drills/:id/runs` and `GET /runs/:id` with tool entitlement, quotas, size limits and server-set Drill settings
- [ ] `run_cache` by content hash; polling backoff (1 s, 2 s, 5 s)
- [ ] Queue position in the UI; status page
- [ ] Drill workspace: editors and waveform view reused from `formal-verify-frontend` as a library
- [ ] Publish gate: reference PASS and each seeded-bug variant FAIL on the real solver, in CI with a fixture Drill
- [ ] Attack test against the deployed runner (path traversal, config injection, endless run, unauthenticated call)

## Gate

All findings Fixed with regression tests and the attack test passes. Only then start phase 4.

## Docs to read

`docs/architecture/solver-integration.md`, `docs/security/solver-hardening.md`, `.claude/rules/solver.md`.
