# 0005. One active device per learner

- Status: Accepted
- Date: 2026-10-01

## Context

Account sharing is the most common way paid content leaks.

## Decision

A learner has one active session. Signing in on a second device ends the first. Open pages re-check every minute.

## Consequences

Some legitimate users will be signed out when switching devices; the page tells them why. Admin can help through support.
