"""sby is a Python script run by the python3 on PATH; the server makes it
start even when that python3 lacks sby's modules, and says what is wrong
when it cannot (services/proc.sby_environment)."""

import os
import stat
import sys

import pytest

from app.praman.services import proc
from tests.praman.conftest import requires_sby


@pytest.fixture(autouse=True)
def fresh():
    proc._sby_state = None
    yield
    proc._sby_state = None


def fake_sby(directory, body: str) -> None:
    script = directory / "sby"
    script.write_text("#!/bin/sh\n" + body + "\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)


def test_sby_that_starts_is_used_as_it_is(tmp_path, monkeypatch):
    fake_sby(tmp_path, "exit 0")
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}/usr/bin{os.pathsep}/bin")
    assert proc.sby_environment() == (None, "")


def test_sby_is_started_with_the_servers_python_when_the_one_on_path_lacks_its_modules(tmp_path, monkeypatch):
    # this sby works only when the directory of the running interpreter is first on PATH
    here = os.path.dirname(sys.executable)
    fake_sby(tmp_path, f'case "$PATH" in "{here}":*) exit 0;; esac\n'
                       "echo \"ModuleNotFoundError: No module named 'click'\" >&2; exit 1")
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}/usr/bin{os.pathsep}/bin")
    env, problem = proc.sby_environment()
    assert problem == "" and env is not None and env["PATH"].startswith(here + os.pathsep)


def test_what_stops_sby_is_reported_when_nothing_helps(tmp_path, monkeypatch):
    fake_sby(tmp_path, "echo \"ModuleNotFoundError: No module named 'click'\" >&2; exit 1")
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}/usr/bin{os.pathsep}/bin")
    assert proc.sby_environment() == (None, "ModuleNotFoundError: No module named 'click'")
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("PATH", str(empty))
    assert "not found" in proc.sby_environment(refresh=True)[1]


@requires_sby
def test_the_real_sby_starts():
    assert proc.sby_environment()[1] == ""
