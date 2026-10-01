# 0014. Cloudflare in front of everything

- Status: Accepted
- Date: 2026-10-01

## Context

We need bot and scraping controls before requests reach the app, and a second factor on admin.

## Decision

Put Cloudflare (WAF, bot rules, rate limits) in front of the site and use Cloudflare Access with MFA for admin.siliconbox.in.

## Consequences

One more vendor in the path. Configuration is part of the launch checklist.
