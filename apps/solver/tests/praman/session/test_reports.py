"""Praman's reports: assertion strength (check_strength), equivalence
(check_equivalence), the downloadable report and what drives a signal."""

import time

import pytest
from fastapi.testclient import TestClient

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.main import app
from app.praman.session import Session
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby
from tests.praman.session.designs import PAIR, PAIR_SVA, PM_TCL

pytestmark = [pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed"), requires_sby]
client = TestClient(app)


@pytest.fixture
def work(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)


@pytest.fixture
def session(work):
    s = Session(persistent=False)
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


def test_report_drivers_and_equivalence_trace_routes(work):
    anon = {"X-Praman-Workspace": "browser-key-reports"}
    other = {"X-Praman-Workspace": "someone-else"}
    sid = client.post("/api/praman/sessions", headers=anon).json()["id"]
    try:
        assert client.get(f"/api/praman/sessions/{sid}/report", headers=anon).status_code == 404, "no proof yet"
        client.post(f"/api/praman/sessions/{sid}/files", headers=anon,
                    files=[("files", ("pair.sv", PAIR)), ("files", ("pair_sva.sv", PAIR_SVA)),
                           ("files", ("broken.sv", PAIR.replace("q <= q + 1", "q <= q + 2")))])
        for line in ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n",
                     "prove -all", "check_equivalence -revised {broken.sv} -bounded -depth 8"):
            client.post(f"/api/praman/sessions/{sid}/command", json={"line": line}, headers=anon)
        for _ in range(2400):
            state = client.get(f"/api/praman/sessions/{sid}/poll", params={"after": 0}, headers=anon).json()
            if not state["busy"] and (state["state"]["equivalence"] or {}).get("status") not in (None, "running"):
                break
            time.sleep(0.05)

        report = client.get(f"/api/praman/sessions/{sid}/report", headers=anon)
        assert report.status_code == 200
        assert report.headers["content-disposition"] == 'attachment; filename="praman-report-pair-run1.html"'
        assert "ap_bad" in report.text and "<script" not in report.text.replace("&lt;script", "")
        assert client.get(f"/api/praman/sessions/{sid}/report", headers=other).status_code == 404

        drivers = client.get(f"/api/praman/sessions/{sid}/drivers", headers=anon,
                             params={"property": "ap_bad", "signal": "pair.qa", "cycle": 3})
        assert drivers.status_code == 200 and drivers.json()["drivers"], drivers.text
        assert client.get(f"/api/praman/sessions/{sid}/drivers", headers=other,
                          params={"property": "ap_bad", "signal": "pair.qa"}).status_code == 404

        trace = client.get(f"/api/praman/sessions/{sid}/equivalence/trace", headers=anon)
        assert trace.status_code == 200 and trace.json()["vcd_data"]["signal_details"]
        assert client.get(f"/api/praman/sessions/{sid}/equivalence/trace", headers=other).status_code == 404
    finally:
        client.delete(f"/api/praman/sessions/{sid}", headers=anon)


def test_the_old_tools_routes_are_gone():
    for path in ("/api/formal/run-upload", "/api/formal/check-upload", "/api/sva/generate"):
        assert client.post(path).status_code == 404
    assert client.get("/api/formal/status/x").status_code == 404
    assert client.get("/api/health").status_code == 200, "the health check stays"
