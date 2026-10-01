"""Shapes that cross a boundary: the job the backend sends, and the result a run produces.

On the wire fields are camelCase (the web app is TypeScript); in Python they are snake_case.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.limits import MAX_DEPTH, MAX_DESIGN_BYTES, MAX_PROPERTIES_BYTES, MAX_TIMEOUT_SECONDS

IDENTIFIER_PATTERN = r"^[A-Za-z_][A-Za-z0-9_]{0,63}$"

RunStatus = Literal["PASS", "FAIL", "TIMEOUT", "ERROR"]
CheckStatus = Literal["PASS", "FAIL", "TIMEOUT", "ERROR", "SKIPPED"]


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True
    )


class RunSettings(WireModel):
    """Set by the SiliconBox backend from the Drill; a learner never chooses these."""

    mode: Literal["bmc", "prove", "cover"]
    solver: Literal["boolector", "yices", "z3"]
    depth: int = Field(ge=1, le=MAX_DEPTH)
    timeout_seconds: int = Field(ge=1, le=MAX_TIMEOUT_SECONDS)
    top_module: str | None = Field(default=None, pattern=IDENTIFIER_PATTERN)


def _within_bytes(value: str, limit: int, what: str) -> str:
    if len(value.encode()) > limit:
        raise ValueError(f"{what} is over {limit // 1024} KB")
    return value


class JobSpec(WireModel):
    """One run: the Drill's design (may be empty) and the learner's properties."""

    design: str = ""
    properties: str = Field(min_length=1)
    settings: RunSettings

    @field_validator("design")
    @classmethod
    def _design_size(cls, value: str) -> str:
        return _within_bytes(value, MAX_DESIGN_BYTES, "design")

    @field_validator("properties")
    @classmethod
    def _properties_size(cls, value: str) -> str:
        return _within_bytes(value, MAX_PROPERTIES_BYTES, "properties")


class CheckResult(WireModel):
    """One assert or cover statement, checked on its own."""

    name: str
    kind: Literal["assert", "cover"]
    status: CheckStatus
    step: int | None = None
    message: str = ""
    trace: dict[str, Any] | None = None


class JobResult(WireModel):
    status: RunStatus
    elapsed_seconds: float
    depth_reached: int = 0
    checks: list[CheckResult] = []
    failed_check: str | None = None
    failure_cycle: int | None = None
    message: str = ""
    log: str = ""


def error_result(message: str, elapsed_seconds: float = 0.0) -> JobResult:
    return JobResult(status="ERROR", elapsed_seconds=elapsed_seconds, message=message)
