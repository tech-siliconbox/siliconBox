# 0009. Private, sandboxed solver behind a job queue

- Status: Accepted
- Date: 2026-10-01

## Context

The current backend has no auth, unchecked inputs and in-memory jobs. Runs are CPU-heavy and come in bursts.

## Decision

Only the SiliconBox backend calls the solver, with a signed token. Runs go through a queue to isolated runners (one container per job, no network, limits). Drill settings are attached on the server.

## Consequences

Phase 3 must fix all findings before payments open. Runner hosting cost is unpriced until the load test.
