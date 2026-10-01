# Scaling to 1,000 concurrent learners

Reading and running scale differently, so they are designed separately.

## Reading (cheap)

- A lesson read is one indexed MongoDB query.
- Keep the published lesson in server memory for 30 to 60 seconds; clear on publish.
- Drills and answers are checked against the database every time.
- Vercel Mumbai region beside the Mumbai database. One MongoClient per server instance (Atlas free: 500 connections).
- Target: sub-second page for a warm-cache learner.

## Running (expensive)

- Queue, not direct calls. One isolated container per job; workers scale on queue depth.
- Rough sizing to replace with a measured number: 1,000 online, 10% running at once = 100 simultaneous jobs; at 1 vCPU each, a 100-vCPU burst.
- Polling counts: 100 runs polling every 2 s is 50 status reads a second, half of Atlas free's 100 operations a second. Serve status from memory or Redis and back off the interval.
- Quotas protect the bill. Cache by content hash.

## Database practice

- Index every filtered field.
- Raw run logs in object storage; TTL on old run documents.
- Validate writes with the shared Zod schemas; migrate-mongo from CI.
- Backups: nightly `mongodump` on Atlas free; paid tier for point-in-time backups. Practise a restore every quarter.

## Stage thresholds

Move to the next hosting stage when any happens (tune after a load test): Atlas operations above 70 a second; data above 400 MB of the 512 MB free limit; p95 solver queue wait above 30 seconds; you need point-in-time backups.

## Load test

k6 at 2x the target with realistic Drill designs, against staging. Record p95 page time, p95 queue wait, run time and database operations a second. The measured numbers set the worker count. Results go in `docs/roadmap/load-test-results.md`.
