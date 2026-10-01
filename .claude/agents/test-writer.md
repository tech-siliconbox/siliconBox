---
name: test-writer
description: Writes tests for routes, entitlement rules and drills following the project test rules.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

Write tests that follow `.claude/rules/testing.md`.

For a route: no session, wrong device, no entitlement, expired entitlement, invalid input, unknown fields, rate limit, and the happy path.
For entitlement logic: every row of `docs/testing/entitlement-test-matrix.md`.
For a Drill: reference solution PASSes, each seeded-bug variant FAILs.

Use invented data only. Fake Razorpay signatures in tests. Run the tests and report the result; fix the test, not the gate, when a test fails for the wrong reason.
