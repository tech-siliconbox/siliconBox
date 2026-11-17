"""Publish gate for Drills: `python -m app.gate <content import file.json>`.

Every Drill in the file is run on the real solver, in this process, before it may be published:

- the reference solution gives the Drill's target (PASS or FAIL) on the Drill's design;
- it PASSes on the reference design, when learners are shown a buggy one;
- it FAILs on every seeded bug variant (so a learner's properties can be checked the same way);
- the starter code does not already reach the target (the Drill is not solved before it starts).

The file is the one `pnpm content:import` reads; only the fields the gate needs are read here.
Exit status 0 when every Drill passes, 1 otherwise. A command-line tool for authors and CI, not
an endpoint: learners never reach it.
"""

import json
import os
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.job_runner import run_job
from app.models import JobResult

Target = Literal["PASS", "FAIL"]


class _Model(BaseModel):
    # The import file carries much more (lessons, briefs); the gate reads what it needs.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class BugVariant(_Model):
    name: str
    code: str


class DrillPrivate(_Model):
    reference_solution: str
    reference_design: str | None = None
    bug_variants: list[BugVariant]


class Drill(_Model):
    slug: str
    mode: Literal["bmc", "prove", "cover"]
    solver: Literal["boolector", "yices", "z3"]
    target: Target
    depth: int
    timeout_seconds: int
    top_module: str
    design_code: str = ""
    starter_code: str
    private: DrillPrivate


class Module(_Model):
    drills: list[Drill] = []


class Course(_Model):
    modules: list[Module]


class ContentFile(_Model):
    courses: list[Course]


@dataclass(frozen=True)
class Case:
    """One solver run the gate makes, and the answer it must (or must not) give."""

    label: str
    design: str
    properties: str
    expect: Target
    negate: bool = False  # True: anything but `expect` passes the case


@dataclass(frozen=True)
class Outcome:
    drill: str
    case: Case
    status: str
    ok: bool


def cases(drill: Drill) -> Iterator[Case]:
    reference = drill.private.reference_solution
    yield Case("reference on the Drill's design", drill.design_code, reference, drill.target)
    if drill.private.reference_design:
        yield Case(
            "reference on the correct design", drill.private.reference_design, reference, "PASS"
        )
    for variant in drill.private.bug_variants:
        yield Case(f"reference on bug '{variant.name}'", variant.code, reference, "FAIL")
    yield Case(
        "starter does not already solve it",
        drill.design_code,
        drill.starter_code,
        drill.target,
        negate=True,
    )


def run_case(drill: Drill, case: Case) -> JobResult:
    spec = {
        "design": case.design,
        "properties": case.properties,
        "settings": {
            "mode": drill.mode,
            "solver": drill.solver,
            "depth": drill.depth,
            "timeoutSeconds": drill.timeout_seconds,
            "topModule": drill.top_module if case.design.strip() else None,
        },
    }
    return run_job(json.dumps(spec).encode())


def check_drill(drill: Drill) -> list[Outcome]:
    outcomes = []
    for case in cases(drill):
        status = run_case(drill, case).status
        matched = status == case.expect
        outcomes.append(Outcome(drill.slug, case, status, matched != case.negate))
    return outcomes


def drills_in(content: ContentFile) -> list[Drill]:
    return [
        drill for course in content.courses for module in course.modules for drill in module.drills
    ]


def report(outcome: Outcome) -> str:
    mark = "ok  " if outcome.ok else "FAIL"
    expected = f"not {outcome.case.expect}" if outcome.case.negate else outcome.case.expect
    return (
        f"{mark} {outcome.drill}: {outcome.case.label} (expected {expected}, got {outcome.status})"
    )


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        sys.stderr.write("Usage: python -m app.gate <content import file.json>\n")
        return 2
    # Run through pnpm, the path is relative to where the command was typed.
    path = Path(os.environ.get("INIT_CWD", ".")) / argv[0]
    drills = drills_in(ContentFile.model_validate_json(path.read_text()))
    outcomes = [outcome for drill in drills for outcome in check_drill(drill)]
    for outcome in outcomes:
        sys.stdout.write(report(outcome) + "\n")
    failed = sum(not outcome.ok for outcome in outcomes)
    sys.stdout.write(f"{len(drills)} Drills, {len(outcomes)} checks, {failed} failed.\n")
    return 1 if failed or not drills else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
