---
description: Python rules for the solver service
paths:
  - "apps/solver/**/*.py"
---

# Python rules

- Type hints on every function; Pydantic models for every request, response and job record.
- Small modules with one job: routers (thin), services (logic), job store, runner, config. No logic in routers beyond calling a service.
- No duplicated path, template or validation code. One function builds work paths and checks they stay inside the work root; one function builds the `.sby` file from the fixed template.
- Settings (caps, allow-lists, tokens) come from one config module, never scattered literals.
- Format and lint with ruff; find dead code with vulture. Tests with pytest, one regression test per hardening finding.
- Follow `.claude/rules/code-quality.md` and `.claude/rules/solver.md`.
