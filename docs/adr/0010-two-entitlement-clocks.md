# 0010. Separate content and tool entitlements

- Status: Accepted
- Date: 2026-10-01

## Context

Content access and tool access have different lengths and restart separately.

## Decision

Store a content entitlement per level and a separate tool entitlement. Every purchase or upgrade starts a new 3-month tool window. Content windows follow the purchase table in the access model.

## Consequences

More records per purchase but rules stay simple to test. Unique index per user, kind and level.
