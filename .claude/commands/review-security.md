---
description: Run a security review of the current changes
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*)
---

Use the `security-reviewer` subagent on the current diff (`git diff` plus staged changes). Return its findings ordered by severity. If any finding is critical or high, say the change must not merge.
