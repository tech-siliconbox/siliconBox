"""Live solver output in a Praman session: Engine detail lines in the log,
linked to their property, and the activity of a running property."""

import threading

import pytest

from app.praman.session import Proof
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby
from tests.praman.session.conftest import run

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")


def engine_lines(s):
    return [e for e in s.events if e["kind"] == "engine" and e.get("code") == "PMI049"]


@requires_sby
def test_the_engines_are_shown_as_they_work(session):
    run(session, "source pm.tcl")
    lines = engine_lines(session)
    texts = [e["text"] for e in lines]
    assert any(t.startswith("[all properties · bounded check] engine_0: smtbmc") for t in texts), texts[:5]
    assert "[all properties · bounded check] engine_0: ap_bad failed" in texts
    assert "[all properties · covers] engine_0: ap_bad:precondition1 reached in step 3" in texts, "table names"
    assert "[all properties · covers] engine_0: ap_vacuous:witness1 not reached" in texts
    mine = [e for e in lines if e.get("prop") == "ap_vacuous:precondition1"]
    assert mine and all(e["text"].startswith("[pair.i_sva.ap_vacuous:precondition1 · precondition proof] ")
                        for e in mine)
    assert any("done: PASS" in e["text"] for e in mine), "each run's end is shown"
    assert all(not p.activity for p in session.props.values()), "nothing runs any more"


def test_progress_shows_in_the_running_property(session):
    from app.praman.session import Prop
    session.props["ap_x"] = Prop(id="ap_x", name="top.ap_x", type="assert", instance="top", status="running")
    session.props["ap_x:precondition1"] = Prop(id="ap_x:precondition1", name="top.ap_x:precondition1",
                                               type="cover", instance="top", parent="ap_x",
                                               related="precondition", status="running")
    proof = Proof(running=True, job_id="j", cancel=threading.Event())
    session.proof = proof
    session.commands._engine(proof, "ap_x", "proof", "engine_0: frame 12", True)
    session.commands._engine(proof, "ap_x", "precondition", "engine_0: step 3", True)
    session.commands._engine(proof, "ap_x", "proof", "engine_0: status: passed", False)
    assert session.props["ap_x"].activity == "proof: engine_0: frame 12", "a milestone does not replace progress"
    assert session.props["ap_x:precondition1"].activity == "precondition: engine_0: step 3"
    assert [e.get("prop") for e in engine_lines(session)] == ["ap_x", "ap_x:precondition1", "ap_x"]
    other = Proof(running=True, job_id="k", cancel=threading.Event())
    session.commands._engine(other, "ap_x", "proof", "engine_0: frame 13", True)
    assert session.props["ap_x"].activity.endswith("frame 12"), "lines of an older proof are ignored"



def test_a_run_of_several_shows_on_the_rows_it_checks(session):
    from app.praman.session import Prop
    for pid, kind in (("ap_a", "assert"), ("ap_b", "assert"), ("cp_c", "cover"), ("as_d", "assume")):
        session.props[pid] = Prop(id=pid, name=f"top.{pid}", type=kind, instance="top",
                                  status="assumed" if kind == "assume" else "running")
    proof = Proof(running=True, job_id="j", cancel=threading.Event())
    session.proof = proof
    session.commands._engine(proof, "", "bounded check", "engine_0: step 5", True)
    session.commands._engine(proof, "", "covers", "engine_0: cover step 2", True)
    assert [session.props[p].activity for p in ("ap_a", "ap_b", "cp_c", "as_d")] == [
        "bounded check: engine_0: step 5", "bounded check: engine_0: step 5", "covers: engine_0: cover step 2", ""]
    session.commands._engine(proof, "ap_a", "proof", "engine_1.induction: induction step 3", True)
    session.commands._engine(proof, "", "proof", "engine_0: frame 4", True)
    assert session.props["ap_a"].activity == "proof: engine_1.induction: induction step 3", "its own run wins"
    assert session.props["ap_b"].activity == "proof: engine_0: frame 4"
