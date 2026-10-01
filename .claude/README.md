# .claude folder

Configuration for Claude Code in this repository.

| Path | What it holds |
| --- | --- |
| `rules/` | Short rules, some scoped to paths. `security`, `api-routes`, `content-protection`, `mongodb`, `solver`, `naming-drill`, `testing`, `ui-design`, `code-quality`, `react-components`, `python` |
| `agents/` | Subagents: `security-reviewer`, `entitlement-auditor`, `solver-hardener`, `db-migration-reviewer`, `test-writer`, `content-editor`, `docs-keeper`, `code-reviewer` |
| `commands/` | Slash commands: `/status`, `/next-task`, `/start-phase`, `/review-security`, `/audit-entitlements`, `/check-naming`, `/add-drill`, `/add-question`, `/add-route`, `/add-migration`, `/new-adr`, `/release-check`, `/load-test`, `/update-docs`, `/review-code`, `/find-duplicates` |
| `skills/` | `entitlement-rules`, `drill-authoring`, `lesson-blocks`, `brand-ui`, `razorpay-webhook` |
| `settings.json` | Shared permissions: common checks allowed; secrets, `rm -rf`, force-push and network downloads denied |

Personal overrides go in `.claude/settings.local.json` (git-ignored).
