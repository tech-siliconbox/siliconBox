---
description: Run the pre-launch checklist and report what is missing
allowed-tools: Read, Grep, Glob, Bash(pnpm:*)
---

Walk `docs/security/security-checklist.md`, `docs/roadmap/phase-4-payments-launch.md` gate and `docs/legal/` checklists. For each item report done, not done or cannot tell, with evidence (file, test or config). Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm test:entitlements`. Finish with a go or no-go and the blockers.
