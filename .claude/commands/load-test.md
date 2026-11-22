---
description: Plan or run the k6 load test at 2x the target
allowed-tools: Read, Write, Edit, Bash(k6:*)
---

Read `docs/architecture/scaling.md`. Use or create scripts in `apps/web/loadtest/`. Scenarios: 1,000 concurrent learners reading lessons; 10% of them pressing Run at the same time with realistic Drill designs. Target 2x. Record p95 page time, p95 queue wait, run time and database operations per second. Write results to `docs/roadmap/load-test-results.md`. Only run against a local stack, or against production before it opens to learners (there is no staging, ADR 0032); never against production with real learners on it.
