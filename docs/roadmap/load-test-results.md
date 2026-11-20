# Load test results

No test has been run yet. Record each run here: date, target (1x or 2x), scenario, p95 page time, p95 queue wait, run time, database operations a second, worker count used, and the decision taken.

| Date | Target | p95 page | p95 queue wait | Run time | Atlas ops/s | Workers | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Praman sessions (ADR 0031)

How many open sessions a solver host takes. Script: `apps/web/loadtest/praman-sessions.js`
(how to run: `apps/web/loadtest/README.md`).

### 2026-11-20: capacity per session (local, container runner)

- **Machine:** a development Mac (Apple Silicon, arm64 like the planned Oracle A1 host). Docker
  Desktop had 8 CPUs and 3.8 GiB. The runtime was runc (gVisor does not run on macOS), with
  `SOLVER_SESSION_SLOTS=4`.
- **Load:** the 14 Praman end-to-end tests on two test workers. They prove, measure strength,
  coverage and the proof core, check equivalence, ask what-if, quiet-trace and drivers questions,
  and restore runs. Separately, one session ran the example FIFO through prove, strength,
  coverage and the proof core, sampled every second.
- **Results:**

| Measure | Result |
| --- | --- |
| Sessions over the run / most open at once / waited in line | 11 / 4 / none |
| Memory of an open session | about 95 MiB at rest, 132 MiB at most (the cap is 1.5 GiB) |
| CPU of a session | its whole 1-CPU cap while an engine runs; about none at rest |
| Example FIFO: prove, strength, coverage, proof core | about 18 s on one CPU |
| Tests | 14 of 14 passed |

**What it means for a host:**
- **Memory does not limit sessions; CPU does.** Even at the 1.5 GiB cap, 14 sessions fit in 21 GiB.
- **One proving session takes one CPU.** Sessions over the CPU count share them: each proof then
  takes longer in real time, and so uses more of the learner's proof minutes, which count real
  engine time.

**Recommended (founder to confirm):** the solver on the Oracle Cloud A1 host of ADR 0022
(4 OCPU, 24 GB, arm64), with `SOLVER_RUNNER=container`, gVisor and `SOLVER_SESSION_SLOTS=8`.
- That is two open sessions per OCPU: an open session is idle most of the time while the learner
  reads and edits.
- It leaves about 12 GB for the API, worker, supervisor and Drill jobs.
- Raise the slots when the waiting line forms while CPU stays below 70 %
  (`docs/runbooks/praman-sessions.md`).

### Still to run

- **The k6 script:** k6 was not installed on the development machine. It records p95 poll,
  command and open times and the time in line with 8 virtual learners against 4 and then 8 slots.
- **The same on the A1 host with gVisor,** before the tool page opens to learners. Add a row to
  the table above for each run.
