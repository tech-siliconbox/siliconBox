"""What-if on a trace (Visualize): a new trace of the property with signals
pinned to values in given cycles."""

import pytest

from app.praman.tclhost import CommandError, tclsh_path
from app.praman.services.counterexample import trace_payload
from app.praman.services.formal_service import get_job
from tests.praman.conftest import requires_sby
from tests.praman.session.test_session import run, session  # noqa: F401  (fixture)

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")
SETUP = ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n")


def value(payload, path, cycle):
    """The value of `path` in `cycle` of a trace (cycle k starts where smt_step is k)."""
    sigs = {s["full_name"]: s for s in payload["vcd_data"]["signal_details"]}
    starts = sorted({t["time"] for t in sigs["smt_step"]["transitions"]})
    at = starts[cycle]
    current = None
    for t in sigs[path]["transitions"]:
        if t["time"] <= at:
            current = t["value"]
    return current


@requires_sby
def test_a_pinned_value_is_in_the_new_trace_in_its_cycle(session):
    run(session, *SETUP, "prove -property {ap_bad}")
    original = trace_payload(get_job(session.props["ap_bad"].job_id), "ap_bad")
    trigger = original["debug"]["trigger_cycle"]
    assert value(original, "pair.en_a", trigger) == "1"
    found = session.commands.what_if("ap_bad", [{"signal": "pair.en_a", "cycle": trigger, "value": "0", "width": 1}])
    assert found["verdict"] == "FAIL" and not found["message"]
    edited = trace_payload(get_job(found["job_id"]), "ap_bad")
    assert value(edited, "pair.en_a", trigger) == "0", "the pin holds in exactly its cycle"
    assert edited["debug"]["trigger_cycle"] != trigger, "so the property fails another way"


@requires_sby
def test_values_that_make_it_hold_or_cannot_happen(session):
    run(session, *SETUP, "prove -property {ap_bad}")
    # en_a never high: the antecedent never matches, no counterexample
    pins = [{"signal": "en_a", "cycle": c, "value": "0", "width": 1} for c in range(0, 30)]
    held = session.commands.what_if("ap_bad", pins)
    assert held["verdict"] != "FAIL" and "no counterexample" in held["message"]
    # qa is 0 right after reset: 7 there cannot happen
    impossible = session.commands.what_if("ap_bad", [{"signal": "qa", "cycle": 2, "value": "7", "width": 3}])
    assert "cannot all happen" in impossible["message"]
    with pytest.raises(CommandError):
        session.commands.what_if("ap_bad", [{"signal": "qa; $finish", "cycle": 2, "value": "7", "width": 3}])


@requires_sby
def test_another_counterexample(session):
    run(session, *SETUP, "prove -property {ap_bad}")
    first = session.props["ap_bad"].job_id
    other = session.commands.what_if("ap_bad", [], differ_from=first)
    assert other["verdict"] == "FAIL", other["message"]
    a = trace_payload(get_job(first), "ap_bad")
    b = trace_payload(get_job(other["job_id"]), "ap_bad")
    until = a["debug"]["event_cycle"]
    inputs = ("pair.en_a", "pair.en_b", "pair.rst_n")
    assert any(value(a, i, c) != value(b, i, c) for i in inputs for c in range(until + 1)), "its inputs differ"


@requires_sby
def test_another_counterexample_varies_only_the_inputs_the_property_depends_on(session):
    run(session, *SETUP, "prove -property {ap_bad}")
    first = session.props["ap_bad"].job_id
    assert session.commands._cone_inputs(session.props["ap_bad"]) == {"clk", "rst_n", "en_a"}, "not en_b"
    other = session.commands.what_if("ap_bad", [], differ_from=first)
    assert other["verdict"] == "FAIL", other["message"]
    a = trace_payload(get_job(first), "ap_bad")
    b = trace_payload(get_job(other["job_id"]), "ap_bad")
    until = a["debug"]["event_cycle"]
    assert any(value(a, "pair.en_a", c) != value(b, "pair.en_a", c) for c in range(until + 1)), \
        "en_a differs: a trace differing only in en_b would fail the same way"
    note = [e["text"] for e in session.events if e.get("code") == "PMI097"][-1]
    assert "(en_a, rst_n)" in note and "en_b cannot change whether it fails" in note


def changes(payload, paths, until):
    return sum(1 for p in paths for c in range(1, until + 1) if value(payload, p, c) != value(payload, p, c - 1))


@requires_sby
def test_a_quiet_trace_has_the_fewest_input_changes(session):
    run(session, *SETUP, "prove -property {ap_bad}")
    quiet = session.commands.quiet_trace("ap_bad")
    assert quiet["verdict"] == "FAIL" and quiet["changes"] == 0, "en_a high all along counts to 5"
    trace = trace_payload(get_job(quiet["job_id"]), "ap_bad")
    until = trace["debug"]["event_cycle"]
    start = next(c for c in range(until + 1) if value(trace, "pair.rst_n", c) == "1")
    assert sum(1 for p in ("pair.en_a", "pair.en_b") for c in range(start + 1, until + 1)
               if value(trace, p, c) != value(trace, p, c - 1)) == 0, "not one input moves after the reset"
    assert any("Quiet trace" in e["text"] and "0 input changes" in e["text"] for e in session.events)
    with pytest.raises(CommandError):
        session.commands.quiet_trace("ap_full_stays")      # not run: no trace
