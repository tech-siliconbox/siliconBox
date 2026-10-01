# 0003. Payload CMS for the admin area

- Status: Accepted
- Date: 2026-10-01

## Context

Non-developers must edit lessons, Drills and questions without a deploy, with drafts, versions and roles.

## Decision

Use Payload CMS inside the same Next.js app, writing to the same MongoDB. Roles: Author, Editor, Support, Owner.

## Consequences

No separate CMS to run. Content edits never need a deploy. Payload upgrades must be tracked with the Next.js version.
