# Content protection

Summary of the controls that protect paid content. Mechanics: `docs/architecture/content-delivery.md`.

1. Auth wall and per-request entitlement check.
2. Server-rendered paid pages with `Cache-Control: private, no-store`.
3. Structured lesson blocks, one lesson per response, opaque ids.
4. Inline SVG diagrams; signed and watermarked raster images only when unavoidable.
5. Pacing limits and anomaly alerts per account.
6. One active device at a time.
7. Watermarks on everything a signed-in learner sees.
8. Terms that forbid sharing, with a traced leak leading to account action.
9. Hidden solutions and answers stored apart from learner-readable data.
10. Cloudflare WAF and bot scoring at the edge.

## What we do not rely on

`robots.txt`, obfuscated JavaScript, or disabling right-click. These do not stop a determined copier and hurt accessibility.

## Leak response

Trace the watermark to the account, suspend it, rotate anything exposed, and follow `docs/runbooks/account-takeover-or-leak.md`.
