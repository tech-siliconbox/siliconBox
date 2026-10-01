---
name: lesson-blocks
description: Use when creating or rendering lesson content. Explains the structured block format and the no-video, inline-SVG rules.
---

# Lesson blocks

Lessons are ordered, typed blocks, not one HTML blob: `heading`, `paragraph`, `code`, `assertion` (SVA snippet), `callout`, `diagram`.

- Diagrams are inline SVG or diagram data rendered by the server. No image file to hotlink. Raster images only through a short-lived signed URL, watermarked.
- No video. Text, code and diagrams only.
- Each save is a version. Learners see only the last published version.
- The API returns one lesson at a time and only when the learner's level allows it.
- Source text comes from the author's own Markdown in `content/courses/`. Never copy text from other courses.

Schema: `packages/shared/src/schemas/lesson.ts` (create in phase 2). Importer: `pnpm content:import`.
