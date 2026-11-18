# 0026. Readable page addresses: slugs, never ids

- Status: Accepted (founder, 2026-11-18)
- Date: 2026-11-18
- Changes: the "opaque ids" rule now applies to API paths only

## Context

Lesson, Drill and answer pages were addressed by random public ids
(`/learn/8f593a66-…`). The founder wants addresses that read as the content, with no
database or public id in the address bar.

## Decision

| Page | Address |
| --- | --- |
| Course | `/courses/basic` |
| Module page (lesson) | `/courses/basic/formal-tool-flow` |
| Drill | `/courses/basic/drills/first-proof-the-mod-3-counter` |
| Question answer | `/questions/<words of the question>` |
| Admin lesson preview | `/preview/lessons/<lesson slug>` |

- Slugs are unique per collection. The converter names a module page from its heading; Drill
  slugs come from their titles; a question's slug is made from its text when the editor leaves
  it empty (migration `20261008000000-question-slugs` filled existing questions).
- A lesson or Drill must belong to the course in its address, or the page is "not found".
- Sections inside a page have anchors made from their headings (`#section-lab-4-first-proof`).
- API paths keep opaque public ids (`/api/v1/runs/:id`, the progress body); they never show in
  the address bar.

## Consequences

- Addresses tell nothing that the public outline does not: titles are public already. Access is
  unchanged: every page still checks the session and entitlement on each request.
- Renaming a slug changes the address; old addresses stop working (no redirects while there are
  no learners).
