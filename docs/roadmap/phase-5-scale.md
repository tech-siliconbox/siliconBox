# Phase 5: Scale

Goal: hold 1,000 concurrent learners with low latency.

Start when any stage threshold is hit: Atlas operations above 70 a second; data above 400 MB; p95 solver queue wait above 30 seconds; need for point-in-time backups.

## Tasks

- [ ] Move to a paid Atlas tier with point-in-time backups
- [ ] Solver runners that scale with queue depth
- [ ] Paid Redis
- [ ] Status polling served from memory or Redis
- [ ] Re-run the k6 load test after each change; record in `load-test-results.md`
- [ ] Tune the lesson cache and indexes from real query data
- [ ] Review run history size; move raw logs to object storage; TTL
- [ ] Restore drill every quarter

## Gate

The load test at 2x the 1,000-concurrent target meets the targets in `docs/architecture/scaling.md`.
