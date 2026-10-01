---
name: drill-authoring
description: Use when creating or editing a Drill (hands-on formal verification exercise): front matter, starter code, reference solution, seeded bugs and publish gate.
---

# Drill authoring

A **Drill** is a hands-on exercise run on the formal tool. Template: `content/courses/_template/drill.md`.

## Parts

- Front matter: title, level, topic, `top_module`, `mode`, `solver`, `depth`, `timeout`. The server attaches these; learners cannot change them.
- Starter code the learner edits.
- Reference solution (private, in `drill_private`).
- Hidden test properties (private).
- At least one seeded-bug variant that must FAIL.

## Publish gate

Before publishing, on the real solver: the reference solution PASSes and every seeded-bug variant FAILs. Otherwise the Drill is broken.

## Limits

`depth` and `timeout` must be within the caps for the level. Result shape: status (PASS, FAIL, TIMEOUT, ERROR), elapsed time, output, assertion, failure cycle, counterexample trace.

## Quality

Track pass rate and average attempts per Drill; one nobody passes is a content bug. Never reveal the reference solution or hidden properties in any public response.
