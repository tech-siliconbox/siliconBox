"""What crosses into a session container: one JSON request per line on stdin (ADR 0031).

The supervisor sends what the web app asked for, each request in an Envelope with its id; the
host answers each with one line {"id", "reply"}. Every request is validated here, with size
limits, before the session sees it.
"""

from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter, field_validator

from app.limits import (
    PRAMAN_MAX_DAILY_SECONDS,
    PRAMAN_MAX_FILES_BYTES,
    PRAMAN_MAX_PROOF_SECONDS,
    PRAMAN_MAX_TRACE_LENGTH,
)
from app.models import WireModel

MAX_LINE_CHARS = 100_000  # one console line (formal-verify's limit); longer scripts are files
MAX_NAME_CHARS = 255
MAX_PINS = 64

Name = Annotated[str, Field(min_length=1, max_length=MAX_NAME_CHARS)]


class Ceilings(WireModel):
    """The learner's ceilings for their level, and the proof time they have left today."""

    proof_seconds: int = Field(ge=1, le=PRAMAN_MAX_PROOF_SECONDS)
    trace_length: int = Field(ge=1, le=PRAMAN_MAX_TRACE_LENGTH)
    seconds_left: int = Field(ge=0, le=PRAMAN_MAX_DAILY_SECONDS)


def files_size(files: dict[str, str]) -> int:
    return sum(len(name.encode()) + len(text.encode()) for name, text in files.items())


class Saved(WireModel):
    """What the web app kept of a session (its last save), to open it again."""

    created_at: float
    journal: list[str] = Field(default=[], max_length=10_000)
    settings: dict[str, Any] = {}
    files: dict[str, str] = {}
    events: list[dict[str, Any]] = Field(default=[], max_length=20_000)
    state: dict[str, Any] = {}

    @field_validator("files")
    @classmethod
    def _files_size(cls, files: dict[str, str]) -> dict[str, str]:
        if files_size(files) > PRAMAN_MAX_FILES_BYTES:
            raise ValueError("the session's files are over 1 MB")
        return files


class Open(WireModel):
    op: Literal["open"]
    session_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    name: str = Field(default="", max_length=80)
    saved: Saved | None = None
    ceilings: Ceilings


class Command(WireModel):
    op: Literal["command"]
    line: str = Field(min_length=1, max_length=MAX_LINE_CHARS)
    ceilings: Ceilings


class Poll(WireModel):
    op: Literal["poll"]
    after: int = Field(default=0, ge=0)
    version: int = Field(default=-1, ge=-1)
    ceilings: Ceilings


class PutFile(WireModel):
    op: Literal["putFile"]
    name: Name
    text: str = Field(max_length=PRAMAN_MAX_FILES_BYTES)


class DeleteFile(WireModel):
    op: Literal["deleteFile"]
    name: Name


class Pin(WireModel):
    signal: str = Field(min_length=1, max_length=MAX_NAME_CHARS)
    cycle: int = Field(ge=0, le=PRAMAN_MAX_TRACE_LENGTH)
    value: str = Field(min_length=1, max_length=1_100)
    width: int = Field(default=1, ge=1, le=4096)
    radix: Literal["hex", "dec", "bin", "signed"] = "hex"


class WhatIf(WireModel):
    op: Literal["whatIf"]
    property: Name
    pins: list[Pin] = Field(default=[], max_length=MAX_PINS)
    differ_from: str = Field(default="", max_length=MAX_NAME_CHARS)
    quiet: bool = False
    ceilings: Ceilings


class Trace(WireModel):
    op: Literal["trace"]
    property: Name


class Drivers(WireModel):
    op: Literal["drivers"]
    property: Name
    signal: Name
    cycle: int = Field(default=0, ge=0, le=PRAMAN_MAX_TRACE_LENGTH)
    job: str = Field(default="", max_length=MAX_NAME_CHARS)


class CoverageTrace(WireModel):
    op: Literal["coverageTrace"]
    label: Name
    instance: str = Field(default="", max_length=MAX_NAME_CHARS)


class Simple(WireModel):
    """Requests with nothing but their name."""

    op: Literal["stop", "status", "equivalenceTrace", "report", "script", "close"]


Request = Annotated[
    Open
    | Command
    | Poll
    | PutFile
    | DeleteFile
    | WhatIf
    | Trace
    | Drivers
    | CoverageTrace
    | Simple,
    Field(discriminator="op"),
]
REQUEST = TypeAdapter(Request)

REQUEST_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"


class Envelope(WireModel):
    """One line on stdin: a request and the id its reply carries back (replies can come out of
    order: a what-if runs a proof while polls go on)."""

    id: str = Field(pattern=REQUEST_ID_PATTERN)
    request: Request
