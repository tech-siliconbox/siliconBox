# 0007. Paid content is server-rendered per request; no video

- Status: Accepted
- Date: 2026-10-01

## Context

formal.org shipped course text inside static JavaScript, which made it trivially crawlable.

## Decision

Render lessons, Drills and answers on the server per request after an entitlement check, with private no-store caching. Lessons are structured blocks; diagrams are inline SVG. No video.

## Consequences

No static generation for paid pages, so we rely on the memory cache and a fast database. No video means no DRM is needed.
