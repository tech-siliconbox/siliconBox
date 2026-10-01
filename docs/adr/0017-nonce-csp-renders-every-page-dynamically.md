# 0017. Nonce-based CSP, so every page renders per request

- Status: Proposed
- Date: 2026-10-01

## Context

The security rules require a strict Content Security Policy with nonces. Next.js can only put a
nonce on its scripts while rendering a page for a request; a page prerendered at build time has
no nonce, so a strict `script-src` blocks it. `content-delivery.md` planned the public pages
(landing, pricing, outlines) as static and cached at the CDN.

## Decision

Generate a fresh nonce per request in `src/proxy.ts` and render every page dynamically (the root
layout awaits `connection()`). `style-src` uses the nonce too, so components must not set inline
`style` attributes: `CspImage` replaces `next/image`, and `Watermarked` draws with SVG.

## Consequences

Public HTML is rendered per request and not cached at the Cloudflare edge; static assets still
are. The public pages are small, so this is cheap at the planned scale. If load tests show a
problem, revisit with Next's hash-based Subresource Integrity (experimental) for public pages
only, recorded in a new ADR.
