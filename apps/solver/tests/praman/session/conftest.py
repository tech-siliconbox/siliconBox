"""The session every Praman session test drives, and the helper that runs console lines."""

import time

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.session import Session
from tests.praman.session.designs import HARD, PAIR, PAIR_SVA, PM_TCL


@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    s = Session()
    s.files.update({"pair.sv": PAIR, "pair_sva.sv": PAIR_SVA, "pm.tcl": PM_TCL, "hard.sv": HARD})
    yield s
    s.close()


def run(session, *lines, timeout=300, background=False):
    """Run console lines; with background, return once the commands are done
    (a proof started with -bg may still be running)."""
    for line in lines:
        session.submit(line)
    if background:
        end = time.time() + timeout
        while session.busy and time.time() < end:
            time.sleep(0.02)
        assert not session.busy
    else:
        assert session.wait_idle(timeout), "the session did not become idle"
