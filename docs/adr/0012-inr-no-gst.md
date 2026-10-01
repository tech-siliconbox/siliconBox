# 0012. INR pricing, no GST for now

- Status: Accepted
- Date: 2026-10-01

## Context

The business is not GST-registered.

## Decision

Price in INR with the tax rate as a setting, default 0. Send receipts now, GST invoices after registration.

## Consequences

No code change is needed to switch GST on; invoices and receipts need updating.
