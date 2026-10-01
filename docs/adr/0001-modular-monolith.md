# 0001. Modular monolith plus one separate solver

- Status: Accepted
- Date: 2026-10-01

## Context

We need to ship a paid platform quickly with a small team, run it cheaply and debug it easily. Only the formal tool is risky and CPU-heavy.

## Decision

Run the website, learning API, admin and payments as one Next.js + Payload app. Run the formal tool as its own sandboxed service that only the backend can call.

## Consequences

One deployable to operate. The solver can scale and be locked down separately. Split the app further only when a measured limit forces it, with a new ADR.
