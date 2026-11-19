"""
Uploaded files are compiled as one source per kind (all design files under
the first design file's name, all SVA files as one SVA source).  JoinedSource
keeps the line map, so a message about the joined source can name the file
and line the user uploaded.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class _Part:
    name: str
    start: int      # first line of this file in the joined text
    first: int      # line number of that line in the file itself
    lines: int


@dataclass
class JoinedSource:
    name: str                   # name the joined text is compiled under
    text: str = ""
    parts: list[_Part] = field(default_factory=list)

    def line_text(self, line: int) -> str:
        lines = self.text.splitlines()
        return lines[line - 1] if 0 < line <= len(lines) else ""

    def locate(self, line: int) -> tuple[str, int]:
        """(uploaded file, line) for a line of the joined text."""
        for part in self.parts:
            if part.start <= line < part.start + part.lines:
                return part.name, part.first + line - part.start
        return self.name, line


def join_sources(files: list[tuple[str, str]], name: str) -> JoinedSource:
    """Join (file name, text) pairs into one source called `name`: each file
    without surrounding blank space, separated by one blank line."""
    joined = JoinedSource(name)
    chunks, line = [], 1
    for file_name, text in files:
        body = text.strip()
        leading = text[: len(text) - len(text.lstrip())].count("\n")
        count = body.count("\n") + 1
        joined.parts.append(_Part(file_name, line, 1 + leading, count))
        chunks.append(body)
        line += count + 1
    joined.text = "\n\n".join(chunks)
    return joined
