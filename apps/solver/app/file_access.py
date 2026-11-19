"""Learner code never reads or writes files (hardening findings 10 and 20).

Drills refuse the file system tasks and `include. Praman resolves `include among the session's
own files, inside its container, so it refuses only the tasks (ADR 0031).
"""

import re

FILE_TASKS = re.compile(
    r"\$(?:readmem[hb]|writemem[hb]|fopen|fread|fgets|fgetc|fscanf|"
    r"fwrite|fdisplay|fstrobe|fmonitor|sformat|system|dumpfile|dumpvars)\b"
)
INCLUDE = re.compile(r"`\s*include\b")
PRAMAN_REFUSAL = "Praman does not read or write files ($readmemh, $fopen and similar)."


def file_task(text: str) -> str | None:
    """The first file system task `text` uses, if any."""
    found = FILE_TASKS.search(text)
    return found.group(0) if found else None
