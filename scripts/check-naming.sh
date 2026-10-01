#!/usr/bin/env bash
# Fails when the banned word for a Drill appears anywhere tracked (docs/product/glossary.md).
# The two files that define the ban are the only allowed mentions.
set -euo pipefail

banned='k''ata'
if git grep --untracked -n -i -I "$banned" -- ':!CLAUDE.md' ':!.claude/rules/naming-drill.md' ':!scripts/check-naming.sh'; then
  echo "Use \"Drill\" instead of the banned word (see .claude/rules/naming-drill.md)." >&2
  exit 1
fi
if git ls-files --cached --others --exclude-standard | grep -i "$banned"; then
  echo "A file name uses the banned word." >&2
  exit 1
fi
echo "Naming check passed."
