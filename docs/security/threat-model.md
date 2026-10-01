# Threat model

Assets: paid lesson, Drill and answer content; learner accounts and CVs; payment integrity; solver compute.

| Threat | Example | Main controls |
| --- | --- | --- |
| Bulk crawl of paid content | Scripted fetch of every lesson | Account wall, per-request entitlement check, no content in JS or static files, pacing, bot rules, anomaly alerts |
| Account sharing | One paid account used by many people | One device at a time, watermarks, new-device alerts, terms forbidding sharing |
| Screen recording or manual copying | Learner films or retypes content | Cannot be prevented; visible and invisible watermarks make leaks traceable |
| Forged payment | Fake "success" callback, tampered price | Server-side price, signed webhook only, unique payment id |
| Broken object access | Changing a lesson id to read another level | Per-object authorisation in `assertEntitled()`, opaque ids |
| NoSQL injection | `{"$ne": null}` in a body | Zod schemas, operator stripping, no raw query building |
| Solver abuse | Path traversal, config injection, endless runs | Hardening list, server-set limits, isolated runners, service auth |
| Admin takeover | Stolen admin password | Cloudflare Access + MFA, own host, short session, audit log |
| Secret leak | Key in repo or logs | Secret store, scanning in CI, no secrets in logs |
| Data loss | Atlas free has no backups | Nightly `mongodump`, restore drills |
| Denial of service | Floods on login or run | Edge rate limits, per-route limits, queue with backpressure |

## Residual risk

A paying learner can always read what they are shown. The design makes bulk extraction slow and traceable, not impossible. No system is unhackable; the controls make an attack expensive and visible.

## Standards

OWASP ASVS Level 2 for the web app; OWASP API Security Top 10 as the test checklist; a third-party penetration test before launch.
