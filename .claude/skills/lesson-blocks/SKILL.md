---
name: lesson-blocks
description: Use when creating or rendering lesson content. Explains the structured block format and the no-video, inline-SVG rules.
---

# Lesson blocks

Lessons are ordered, typed blocks: `heading`, `paragraph`, `code`, `assertion` (SVA snippet), `callout`, `diagram`, `list`, `table`, `reveal`, `stateGraph`.

An author's course page (ADR 0024) is the exception: its markup is kept in `html` blocks, with `stateGraph` for the interactive figure and `drillEmbed` after each lab. It is sanitised to an allow-list on every render (`apps/web/src/server/course-html.ts`) and styled by the `.course-html` rules in `apps/web/src/app/(site)/lesson-content.css`: give a new author class a rule there, never the author's own stylesheet.

- Diagrams are inline SVG or diagram data rendered by the server. No image file to hotlink. Raster images only through a short-lived signed URL, watermarked.
- No video. Text, code and diagrams only.
- Each save is a version. Learners see only the last published version.
- The API returns one lesson at a time and only when the learner's level allows it.
- Source text is the author's own: Markdown in `content/courses/` or the course HTML pages. Never copy text from other courses.

Schema: `packages/shared/src/schemas/lesson.ts`. Converter: `pnpm content:convert`; importer: `pnpm content:import` (see `content/README.md`).
