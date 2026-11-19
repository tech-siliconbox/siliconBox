"""Properties written in Tcl (assert/assume/cover {expr}), disabling
assumptions, stopat and check_assumptions, as in JasperGold."""

import pytest

from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby, requires_yosys
from tests.praman.session.test_session import run, session  # noqa: F401  (fixture)

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")
SETUP = ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n")


def status(s):
    return {p.id: p.status for p in s.props.values()}


def errors(s):
    return [e["text"] for e in s.events if e["kind"] == "error"]


@requires_yosys
def test_a_property_written_in_tcl_joins_the_table(session):
    run(session, *SETUP, "assume -name a_one_at_a_time {!(en_a && en_b)}", "assert {qa <= 3'd7}",
        "cover -name c_both_three {qa == 3'd3 && qb == 3'd3}")
    a, t, c = session.props["a_one_at_a_time"], session.props["assert_1"], session.props["c_both_three"]
    assert (a.type, a.status, a.file, a.name) == ("assume", "assumed", "Tcl", "pair.a_one_at_a_time")
    assert (t.type, c.type) == ("assert", "cover") and t.expr == "qa <= 3'd7"
    assert "pair.sv" in session.files and "a_one_at_a_time" not in session.files["pair.sv"], "the files stay as they are"
    design, _ = session.commands._split_sources(session.splits)
    assert ("a_one_at_a_time : assume property (@(posedge clk) disable iff (!rst_n) !(en_a && en_b));"
            in design.splitlines()[session.design.text.count("\n", 0, design.index("a_one_at_a_time"))]), \
        "clocked, disabled in reset, on the endmodule line of the top"
    assert design.count("\n") == session.design.text.count("\n"), "no line moves"
    assert session.commands.call("assume", ["-list"]) == "pair.a_one_at_a_time"


@requires_yosys
def test_a_property_that_does_not_compile_is_not_added(session):
    run(session, *SETUP)
    before = dict(session.props)
    for line in ("assume {no_such_signal == 1}", "assume {a; b}", "assert -name ap_bad {qa == 1}",
                 "cover -name 9x {qa == 1}", "assume {}"):
        session.submit(line)
        assert session.wait_idle(60)
    assert set(session.props) == set(before)
    assert any("no_such_signal" in e for e in errors(session))
    assert any('"ap_bad" exists already' in e for e in errors(session))


@requires_sby
def test_an_assumption_constrains_the_proof_and_can_be_left_out(session):
    run(session, *SETUP, "prove -property {ap_bad}")
    assert session.props["ap_bad"].status == "cex"
    run(session, "assume -name a_never_a {!en_a}")
    assert session.props["ap_bad"].status == "not_run", "an assumption added clears the results"
    run(session, "prove -property {ap_bad}")
    assert session.props["ap_bad"].status == "vacuous", "en_a never holds: ap_bad checks nothing"
    run(session, "assume -disable a_never_a", "prove -property {ap_bad}")
    assert session.props["a_never_a"].disabled and session.props["ap_bad"].status == "cex", "no longer assumed"
    assert any("assumptions left out        = a_never_a" in e["text"] for e in session.events)
    run(session, "assume -enable a_never_a", "prove -property {ap_bad}")
    assert session.props["ap_bad"].status == "vacuous"
    run(session, "assume -remove a_never_a", "prove -property {ap_bad}")
    assert "a_never_a" not in session.props and session.props["ap_bad"].status == "cex"


@requires_sby
def test_an_assertion_written_in_tcl_is_proven_and_a_disabled_one_is_not(session):
    run(session, *SETUP, "assert -name t_full_after_seven {qa == 3'd7 |-> fa}", "assert -disable ap_bad",
        "prove -all")
    st = status(session)
    assert st["t_full_after_seven"] == "proven" and st["t_full_after_seven:precondition1"] == "covered"
    assert st["ap_bad"] == "not_run" and session.props["ap_bad"].disabled
    session.submit("assert -remove ap_bad")
    assert session.wait_idle(30)
    assert any("written in pair_sva.sv, not in Tcl" in e for e in errors(session))


@requires_sby
def test_stopat_cuts_a_signal(session):
    run(session, *SETUP, "prove -property {ap_full_stays ap_in_range}")
    assert status(session)["ap_full_stays"] == "proven"
    run(session, "stopat u_a.full", "prove -property {ap_full_stays ap_in_range}")
    st = status(session)
    assert st["ap_full_stays"] == "cex", "fa takes any value now"
    assert st["ap_in_range"] == "proven", "what does not read it still holds"
    assert session.commands.call("stopat", ["-list"]) == "u_a.full"
    assert any("stopat (cut)                = u_a.full" in e["text"] for e in session.events)
    for line in ("stopat nope", "stopat en_a", "stopat -remove u_b.q"):
        session.submit(line)
        assert session.wait_idle(60)
    assert any('"nope" is not a signal of the design' in e for e in errors(session))
    assert any('"en_a" is an input' in e for e in errors(session))
    assert session.stopats == ["u_a.full"]
    run(session, "stopat -clear", "prove -property {ap_full_stays}")
    assert status(session)["ap_full_stays"] == "proven"


@requires_sby
def test_check_assumptions_finds_the_conflict(session):
    run(session, *SETUP, "assume -name a_on {en_a}", "assume -name a_b_on {en_b}")
    assert session.commands.call("check_assumptions", []) == "consistent"
    run(session, "assume -name a_off {!en_a}")
    assert session.commands.call("check_assumptions", []) == "conflict"
    conflict = [e["text"] for e in session.events if e.get("code") == "PME086"][-1]
    assert "pair.a_on" in conflict and "pair.a_off" in conflict and "pair.a_b_on" not in conflict
    run(session, "assume -disable a_off")
    assert session.commands.call("check_assumptions", []) == "consistent", "a disabled one is not assumed"


@requires_yosys
def test_elaborate_drops_them_and_the_session_keeps_them(session):
    run(session, *SETUP, "assume -name a_x {!en_a}", "stopat u_a.q")
    state = session._state()
    assert state["tcl_props"] == [{"name": "a_x", "kind": "assume", "expr": "!en_a"}]
    assert state["stopats"] == ["u_a.q"]
    run(session, "elaborate -top pair")
    assert "a_x" not in session.props and session.stopats == [] and session.tcl_props == []
