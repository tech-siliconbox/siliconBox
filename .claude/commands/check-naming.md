---
description: Find the banned word and other naming slips in the repo
allowed-tools: Grep, Glob, Read
---

Search the whole repo (code, docs, content, config, file names) case-insensitively for the banned word from `.claude/rules/naming-drill.md` and its plural. For each hit give the file and line and the replacement ("Drill"). Do not edit unless asked. The rules file itself and the glossary may mention the word as the banned term; ignore those two.
