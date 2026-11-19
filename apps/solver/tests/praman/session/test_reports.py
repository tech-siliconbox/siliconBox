"""Praman's reports: assertion strength (check_strength) and equivalence
(check_equivalence).  The report download, drivers and the equivalence trace
are tested through the session operations (tests/test_praman_operations.py)."""


import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.session import Session
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby
from tests.praman.session.designs import PAIR, PAIR_SVA, PM_TCL

pytestmark = [pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed"), requires_sby]


@pytest.fixture
def work(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)


@pytest.fixture
def session(work):
    s = Session()
    s.files.update({"pair.sv": PAIR, "pair_sva.sv": PAIR_SVA, "pm.tcl": PM_TCL})
    yield s
    s.close()


def run(session, *lines, timeout=600):
    for line in lines:
        session.submit(line)
    assert session.wait_idle(timeout)


def errors(session):
    return [e["text"] for e in session.events if e["kind"] == "error"]


def test_strength_needs_a_proof_first(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "check_strength")
    assert any("run a proof first" in t for t in errors(session))


def test_strength_of_the_proven_assertions(session):
    run(session, "source pm.tcl", "check_strength -mutants 8")
    assert not errors(session), errors(session)
    st = session.strength
    assert st["status"] == "complete" and st["total"] == 8 and st["done"] == 8
    assert set(st["per_assertion"]) >= {"ap_full_stays", "ap_in_range"}, "the assertions that hold are measured"
    assert "ap_bad" not in st["per_assertion"], "a failing assertion is not"
    assert st["checked"] + st["equivalent"] + sum(m["status"] in ("error", "not_run") for m in st["mutants"]) == 8
    log = [e["text"] for e in session.events]
    assert any(t.startswith("Assertion strength: ") for t in log)
    survivors = [m for m in st["mutants"] if m["status"] == "survived"]
    assert sum("no assertion fails when" in t for t in log) == len(survivors)
    assert session.snapshot()["strength"]["score"] == st["score"]


def test_equivalence_of_a_revised_design(session):
    same = PAIR.replace("module cnt", "// reformatted\nmodule cnt")
    broken = PAIR.replace("q <= q + 1", "q <= q + 2")
    session.files.update({"same.sv": same, "broken.sv": broken})
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n",
        "check_equivalence -revised {same.sv}")
    assert not errors(session), errors(session)
    assert session.equivalence["status"] == "equivalent" and session.equivalence["revised"] == ["same.sv"]

    run(session, "check_equivalence -revised {broken.sv} -bounded -depth 8")
    assert not errors(session), errors(session)
    eq = session.equivalence
    assert eq["status"] == "different" and eq["has_trace"] and eq["differences"]
    assert any("Equivalence: The versions differ" in e["text"] for e in session.events)

    run(session, "check_equivalence -revised {nowhere.sv}")
    assert any('"nowhere.sv" is not among the session files' in t for t in errors(session))
