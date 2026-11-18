# content

Sources for courses, questions and companies. This is the author's own copyrighted material.
Payload is the published source of truth; after the first import, edit in the admin.

## Converting a course from HTML

A course written as HTML pages (one numbered page per module, `index.html` for the course home,
any other page as a reference module, with `style.css` and `sim-vs-formal.js` in a sibling
`assets/` folder) becomes an import file with:

```
pnpm content:convert <course folder> <level> content/import/<level>.json [drills.json] [course slug]
```

Each module stays one page with all its content (ADR 0024): the page becomes the module's one
lesson, its markup kept in `html` blocks with the text word for word; the course home becomes
the course `introduction` on the public course page; module 1 is the free preview. The site
shows the markup in its own design (`apps/web/src/app/(site)/lesson-content.css`), keeping the
colour coding of boxes. The course stylesheet is read only for diagram colours, which are
written onto the SVG. The simulation-vs-formal figure becomes a `stateGraph` block read from
`assets/sim-vs-formal.js` (never run). With a drills import file, each module's Drills follow
its lab as `drillEmbed` blocks, so learners practise on the page. Every change (scripts and
inline styles removed) is printed at the end of the run. Then import the file as below.

The Basic course was converted and imported on 2026-11-18 from `~/Desktop/SB/course/basic`
(outside the repository): 10 modules and the SVA cheatsheet, one page each, with 8 Drills in
`basic-drills.json`.

## Importing courses (JSON)

> The GitHub repository is **public**. Real course files in `content/import/` are git-ignored
> and must never be committed; keep them locally (or in private storage) and import from there.
> Only `placeholders.json` and `demo-formal-verification.json` are tracked.

```
pnpm content:import content/import/<file>.json check   # validate only, writes nothing
pnpm content:import content/import/<file>.json         # create or update
```

The file holds `courses`, each with `modules`, each with `lessons` (format and limits:
`packages/shared/src/schemas/content-import.ts`; examples: `import/placeholders.json` and
`import/demo-formal-verification.json`).

`import/demo-formal-verification.json` holds 30 short demo lessons written for development (not
copied from any course). They are published on the dev database so the whole learner flow can
be tried; the real course content replaces them by re-using the same slugs.

- Documents are matched by **slug**. Importing again updates them in place and keeps each
  lesson's public URL. Use the placeholder slugs (`basic`, `basic-module-01`,
  `basic-module-01-lesson-01`, …) to replace the placeholders with real content.
- `status` is `draft` (default) or `published`. Drafts are never shown to learners.
- `preview: true` makes a lesson a free preview for any signed-in learner (founder's decision, 2026-11-18).
- Blocks: `heading` (`level` "2" to "4"), `paragraph`, `code` (`language`: systemverilog, sby,
  text; optional `filename`), `assertion` (optional `caption`), `callout` (`tone`: note, tip,
  warning, danger; optional `title`), `diagram` (inline `svg`, `alt`, optional `caption`),
  `list` (`ordered`, optional `start`, `items` with `text` and an optional `answer` shown
  behind "Show answer"), `table` (`columns`, `rows` of `cells`), `reveal` (a `label` such as
  "Show hints" and the blocks it hides) and `stateGraph` (an interactive simulation-vs-formal
  figure: panel titles and texts, `testLength`, `states` and `transitions`), `html` (an author's
  page markup, ADR 0024: sanitised on every render, links written `lesson:<slug>`) and
  `drillEmbed` (a Drill slug: the Drill's brief and editor in the page). No video.
- Text format: `` `code` `` (a longer fence such as ``` `` `define `` ``` holds a backtick),
  `**bold**`, `*italic*`, `\` escapes. In callouts, list items, answers and table cells a blank
  line starts a paragraph and lines beginning with `- ` are bullets
  (`packages/shared/src/inline-text.ts`).
- An import overwrites the fields it contains, so re-importing a course after editors have
  changed it in the admin would replace their edits.
- Converted courses end each module with one review lesson: the closing Summary, Exercises
  and Quick quiz sections are merged (title "Summary · Exercises · Quick quiz"), each keeping
  its own heading.

## Drills

Drills are imported from the same kind of file: a module lists `drills` (with or without
`lessons`). Each Drill has its learner-visible part (brief, `designCode`, `starterCode`, mode,
solver, target, depth, timeout, top module) and a `private` part that never reaches learners:
`referenceSolution`, `referenceDesign` (the correct design, when learners see a buggy one),
optional `hiddenProperties` and at least one `bugVariants` entry.

```
pnpm drills:verify content/import/<file>.json   # publish gate, on the real solver
pnpm content:import content/import/<file>.json  # Drills go in as drafts
```

The gate refuses a Drill unless its reference solution gives the target on the Drill's design,
PASSes on the reference design, FAILs on every bug variant, and the starter code does not
already reach the target. Drills default to `draft`; an editor publishes each one in the admin
after review.

Properties connect to the design by **port name**, so a Drill's checker can read only the
design's ports. Helper logic (wires, registers, `always` blocks) may sit in the properties
module, which is how internal behaviour (occupancy, a tracked entry, wait counters) is modelled.

`content/import/basic-drills.json` (git-ignored) holds five Drills built on 2026-11-18 from the
Basic course's own designs (Modules 4, 8 and 9); they are drafts awaiting review.

Importing again updates by slug. Lessons or Drills left in an imported module that the file no
longer lists are reported; add `prune` to delete them (a file that lists only Drills never
touches that module's lessons).

## Markdown templates

The templates below describe the same structure for authors who prefer Markdown.

```
content/
  courses/
    _template/
      course.md      course front matter
      module.md      module front matter
      lesson.md      lesson template
      drill.md       Drill template
    <course-slug>/<module-slug>/...
  questions/
    _template.md     question template
  companies/
    _template.md     company template; logo files alongside
```

Rules: see `docs/product/content-guidelines.md`. No video. The exercise unit is a Drill. Never paste text from other courses.
