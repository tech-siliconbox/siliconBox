---
description: Rules for anything that renders lesson, drill or answer content
paths:
  - "apps/web/src/app/(site)/(member)/**"
  - "apps/web/src/app/api/v1/**"
  - "apps/web/src/server/lessons.ts"
  - "apps/web/src/components/lesson/**"
  - "apps/web/src/components/drill/**"
---

# Content protection rules

- Render paid content on the server per request after the entitlement check. No static generation, no ISR, no CDN caching for paid pages.
- Do not embed lesson text, answers or solutions in client JS, JSON props for unentitled users, or build output.
- Lessons are structured blocks. Diagrams are inline SVG, not image files. Any raster image uses a short-lived signed URL and is watermarked.
- Every paid view includes the visible watermark and the invisible per-user text pattern. Never let styling hide the watermark or hurt contrast.
- The page re-checks the session every minute and shows a clear message when another device took over.
- Do not add a robots.txt entry as protection; it is advice, not security.
