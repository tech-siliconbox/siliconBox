# content

Sources for courses, questions and companies. This is the author's own copyrighted material.
Payload is the published source of truth; after the first import, edit in the admin.

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
- `preview: true` makes a lesson a free preview for any signed-in learner.
- Blocks: `heading` (`level` "2" or "3"), `paragraph`, `code` (`language`: systemverilog, sby,
  text), `assertion` (optional `caption`), `callout` (`tone`: note, tip, warning), `diagram`
  (inline `svg` plus `alt`). No video. Wrap inline code in backticks inside text.
- An import overwrites the fields it contains, so re-importing a course after editors have
  changed it in the admin would replace their edits.

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
