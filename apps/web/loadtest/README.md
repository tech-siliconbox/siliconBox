# Load tests

k6 scripts, run against a **local stack only**: they sign in invented learners and use the solver
for real. Never point them at production or at Atlas (the seed script refuses a database that is
not local).

## Praman sessions (`praman-sessions.js`)

Each virtual learner does what the tool page does: signs in, starts a session (waiting in line
while the solver's slots are full), loads the example FIFO, proves it, polls every second while
busy, and deletes the session. It records how long learners wait in line
(`praman_open_wait`), how long the proof takes (`praman_proof_time`), and the p95 time of the
poll, open and command routes. The thresholds fail the run when p95 poll is over 500 ms or p95
command or open is over 1 s.

1. Start a local stack with its own database (for example `siliconbox_load` on `docker compose`'s
   MongoDB), a production build of the site on port 3100, and the solver with the session runner
   you want to measure (`SOLVER_RUNNER=container`, `SOLVER_SESSION_SLOTS`). Set the email and
   Google variables empty so nothing is sent.
2. Seed the learners (`loadtest-1@example.test` …) with a Basic plan and a tool window:
   `LOAD_LEARNERS=8 LOAD_PASSWORD=<12+ characters> pnpm --filter @siliconbox/web loadtest:seed`
3. Run k6 (install it with `brew install k6`):
   `LOAD_LEARNERS=8 LOAD_PASSWORD=<same> k6 run apps/web/loadtest/praman-sessions.js`
   (`BASE_URL` defaults to `http://localhost:3100`).
4. While it runs, sample the session containers:
   `docker stats --format '{{.Name}},{{.MemUsage}},{{.CPUPerc}}' | grep siliconbox-session`
5. Record the results in `docs/roadmap/load-test-results.md`, then drop the database.

Sign-in allows 10 requests a minute from one IP, so more than 10 learners need a second run or
a slower start.
