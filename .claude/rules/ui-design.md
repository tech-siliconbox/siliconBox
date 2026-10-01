---
description: UI rules taken from the design spec
paths:
  - "apps/web/src/components/**"
  - "apps/web/src/app/**/*.css"
---

# UI rules

- Light theme only. Tokens come from `docs/design/formal-tokens-light.css`. Fonts: Geist and Geist Mono.
- Match layout, spacing and component patterns from `docs/design/formal-org-extraction-spec.md`. Do not copy formal.org's text, logos or images.
- Brand: the logo icon is a separate file (`apps/web/public/brand/siliconbox-logo.png`); "SiliconBox" is live text beside it. No tagline.
- Company tags show the company logo and its name beside it.
- Keyboard navigation and WCAG AA contrast are required. The watermark must not reduce readability.
- Locked services (Industry Ready) show a clear locked state, never a dead link.
