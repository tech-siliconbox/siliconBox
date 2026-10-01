---
description: Audit entitlement, pricing and session logic against the access model
allowed-tools: Read, Grep, Glob, Bash(pnpm test:entitlements:*)
---

Use the `entitlement-auditor` subagent. Also run `pnpm test:entitlements` if the script exists and report pass or fail with the failing rows from `docs/testing/entitlement-test-matrix.md`.
