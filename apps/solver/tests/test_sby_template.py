"""Hardening finding 2: the .sby file is a fixed template; nothing can add script lines."""

import pytest

from app.engine.sby_template import SbySettings, SbyTemplateError, render_sby

GOOD = SbySettings(mode="bmc", solver="boolector", depth=20, timeout_seconds=30, top_module="top")
FILES = [("design.sv", "src/design.sv"), ("monitor.sv", "src/monitor.sv")]


def test_renders_the_fixed_template() -> None:
    assert render_sby(GOOD, FILES) == "\n".join(
        [
            "[tasks]",
            "bmc",
            "",
            "[options]",
            "bmc: mode bmc",
            "bmc: depth 20",
            "bmc: timeout 30",
            "",
            "[engines]",
            "smtbmc boolector",
            "",
            "[script]",
            "read -sv -formal design.sv",
            "read -sv -formal monitor.sv",
            "prep -top top",
            "",
            "[files]",
            "design.sv src/design.sv",
            "monitor.sv src/monitor.sv",
            "",
        ]
    )


@pytest.mark.parametrize(
    "change",
    [
        {"mode": "bmc\n[script]\nshell touch /tmp/pwned"},
        {"mode": "live"},
        {"solver": "boolector\nshell id"},
        {"solver": ""},
        {"top_module": "top\nshell id"},
        {"top_module": "top; shell id"},
        {"top_module": ""},
        {"depth": 0},
        {"depth": 10_000},
        {"timeout_seconds": 0},
        {"timeout_seconds": 10_000},
    ],
)
def test_refuses_unsafe_settings(change: dict) -> None:
    settings = SbySettings(**{**GOOD.__dict__, **change})
    with pytest.raises(SbyTemplateError):
        render_sby(settings, FILES)


@pytest.mark.parametrize(
    "files",
    [
        [],
        [("../design.sv", "src/design.sv")],
        [("design.sv", "/etc/passwd")],
        [("design.sv", "src/../../design.sv")],
        [("design.sv\nshell id", "src/design.sv")],
        [("design.txt", "src/design.txt")],
    ],
)
def test_refuses_unsafe_file_names(files: list) -> None:
    with pytest.raises(SbyTemplateError):
        render_sby(GOOD, files)
