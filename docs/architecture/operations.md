# Operations

## Environments

Dev, staging and production. Preview deployments per pull request. Feature flags for risky launches.

## Monitoring and alerts

- Solver status page so learners know when it is down.
- Alerts: webhook failures, payment mismatches, queue depth, p95 queue wait, Atlas operations a second, data size, error rate.
- Security alerts: concurrent sessions in different countries, headless-browser signs, read bursts, repeated failed sign-ins.

## Email

Receipts, new-device alerts, and reminders 30 and 7 days before the content and tool windows end (Resend or SES).

## Analytics

PostHog or Plausible: where learners drop, which Drills fail most, conversion by level. Drill quality loop: pass rate and average attempts per Drill; a Drill nobody passes is a content bug.

## Support

A support inbox or tool (Crisp or Freshdesk) linked to the learner's account. Support role can view entitlements and grant or extend access with a reason.

## Backups

Nightly `mongodump` to private storage while on Atlas free. Restore drill every quarter. See `docs/runbooks/backup-and-restore.md`.

## Incidents

See `docs/runbooks/account-takeover-or-leak.md` and `docs/runbooks/solver-down.md`.
