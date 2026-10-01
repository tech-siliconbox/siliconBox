---
description: Start a phase by reading its plan and checking the previous gate
argument-hint: <phase number 1-5>
allowed-tools: Read, Grep, Glob, Bash(git log:*)
---

Phase: $ARGUMENTS

1. Read `docs/roadmap/phase-$ARGUMENTS-*.md`.
2. Confirm the previous phase's gate is met. If not, stop and say what is missing. Payments (phase 4) must not start before the phase 3 gate is met.
3. List the tasks in order and propose the first three to do, with tests.
