# 0021. Grade Drill runs against the hidden designs

- Status: Accepted (founder, 2026-11-18)
- Date: 2026-11-18

## Context

A run is graded today on the Drill's visible design alone: solved when the solver's status
equals the Drill's target. That is easy to game. On a prove-it-correct Drill (target PASS),
`assert property (1)` holds and "solves" it. On a find-the-bug Drill (target FAIL),
`assert property (0)` fails and "solves" it. Neither checker says anything about the design.

Each Drill already carries what a sound grade needs, in `drill_private` (stored by Payload as
`drill_privates`): the seeded bug variants, and for find-the-bug Drills the correct design.
The publish gate (`pnpm drills:verify`) proves the reference solution behaves on all of them.
The site's database user cannot read that collection (ADR 0019), by design.

## Decision

Grade a run the way the publish gate checks the reference solution (mutation grading):

- Target PASS: the learner's properties hold on the visible design **and** fail on every bug
  variant.
- Target FAIL: the learner's properties fail on the visible design **and** hold on the correct
  design.

The learner still sees the result on the visible design only; hidden designs are never sent
to the browser, and their results are reported as counts ("caught 3 of 4 seeded bugs").

To read the hidden designs, add a fourth database user, `siliconbox_grader`, with read access
to `drill_privates` only, used by one server module that builds the grading jobs (as the
answers reader is used only by the answers module). Grading jobs are queued with the visible
run and count as one run against the daily quota; they share `run_cache` by content hash.

## Consequences

- "Solved" means the checker is useful, which is what the course teaches.
- Up to five solver jobs per run on the Basic Drills: more runner time per learner. Covered by
  the cache for repeated code and by grading only when the visible run already meets the target.
- One more database user and role (`infra/mongodb/roles.json`, `pnpm db:verify-roles`), applied
  on Atlas with the admin key.
- A Drill without a private part is graded on its visible design only; the publish gate makes
  sure every published Drill has one.
