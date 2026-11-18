# 0024. Course pages: one page per module, complete, in the site's design

- Status: Accepted (founder, 2026-11-18)
- Date: 2026-11-18

## Context

The founder's courses are written as HTML pages: one page per module, a course home, reference
pages (the SVA cheatsheet), a shared stylesheet and one script for an interactive figure. Each
page holds text, code, tables, colour-coded boxes (note, tip, warning, danger), learning
objectives, labs, quizzes with hidden answers and SVG diagrams.

Two earlier conversions were rejected by the founder:

1. Each module split into one lesson per section, rebuilt from structured blocks. Modules
   became lessons, and the colour coding, boxes and some structure were lost.
2. Each page kept whole with the course's own stylesheet. The content was complete but looked
   like a different site (its own fonts, colours and layout).

The founder's direction: every module stays one page with all its content and graphics, the
labs have the practice tool on the page, and the look is the site's own design language.

## Decision

- **One page per module.** Each module page is one lesson of its module; the course home is the
  course's `introduction`, shown on the public course page; each reference page is a module of
  its own. Module 1 is the free preview for signed-in learners.
- **Complete markup.** `pnpm content:convert` keeps each page's markup in `html` blocks, text
  word for word. It removes only the page chrome (site header, footer), scripts and inline
  `style` attributes, and prints every change. Links between pages become `lesson:<slug>` and
  `course:<slug>` tokens, resolved to public ids on the server.
- **The site's design.** The course stylesheet is not stored or served. The rules under
  `.course-html` in `apps/web/src/app/(site)/lesson-content.css` give the author's classes the
  type, spacing and parts of the site's own lesson blocks, in Geist and Geist Mono. Boxes keep
  the author's colour coding with the site's tokens (note blue, tip green, warning amber,
  danger red), shared with the site's `callout` block.
- **Graphics kept.** SVG diagrams keep their drawing; colours the stylesheet gave them are
  written onto the SVG elements at conversion. The interactive simulation-vs-formal figure
  becomes a `stateGraph` block whose states and transitions are read from the script (never
  run), with the original wording.
- **Practice in the page.** A `drillEmbed` block after each lab shows the lab's Drill: its
  brief and the editor with Run verification. It is left out when the Drill is unpublished or
  the learner may not open it.
- **Same protection as every lesson.** The markup is sanitised to an allow-list on every render
  (`server/course-html.ts`), carries the invisible watermark, renders inside
  `ProtectedContent`, and is served only after the entitlement check. Code examples have a Copy
  button; text-drawn waveforms do not.

## Consequences

- Nothing is lost: the converter's text check compares every page with its lessons, and
  anything it changes is listed.
- Editing an author page in the admin means editing HTML in a code field, not structured blocks.
  A class with no rule in `lesson-content.css` renders as plain text in the site's style; add a
  rule when an author uses a new one.
- The content column is the site's lesson width, narrower than the original pages; wide tables
  and long code lines scroll inside their frames.
- The free preview is all of Module 1 (one page) for signed-in visitors, confirmed by the
  founder on 2026-11-18 and recorded in the access model.
- Lessons built from structured blocks (the demo course, Drill briefs) are unchanged.
