"""Case splitting (app/praman/split.py, the case_split command): a hard
assertion is proven as one assertion per case and one for the rest."""

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman import split
from app.praman.session import Session
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby, requires_yosys
from tests.praman.session.designs import PAIR, PAIR_SVA

needs_tcl = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")


# ── The rewrite of the source ─────────────────────────────────

def test_an_assertion_becomes_one_per_case_and_the_rest():
    text = "module m;\n  ap : assert property (a |-> b);\nendmodule\n"
    out = split.split_statement(text, "ap", ["x == 0", "x == 1"])
    assert out == ("module m;\n  ap__case1 : assert property ((x == 0) |-> (a |-> b)); "
                   "ap__case2 : assert property ((x == 1) |-> (a |-> b)); "
                   "ap__case_rest : assert property ((!(x == 0) && !(x == 1)) |-> (a |-> b)); "
                   "ap : assert property (a |-> b);\nendmodule\n"), "the original statement stays"
    assert split.case_labels("ap", 2) == ["ap__case1", "ap__case2", "ap__case_rest"]


def test_clock_and_disable_stay_in_front_of_the_cases():
    text = "ap: assert property (@(posedge clk) disable iff (!rst_n) req |=> gnt);"
    out = split.split_statement(text, "ap", ["mode"])
    assert "ap__case1 : assert property (@(posedge clk) disable iff (!rst_n) (mode) |-> (req |=> gnt));" in out
    assert "ap__case_rest : assert property (@(posedge clk) disable iff (!rst_n) (!(mode)) |-> (req |=> gnt));" in out
    assert out.endswith(text)


def test_a_named_property_and_an_else_action_are_kept():
    text = "ap : assert property (p_named(x)) else $error(\"no\");"
    out = split.split_statement(text, "ap", ["c"])
    assert "ap__case1 : assert property ((c) |-> (p_named(x)));" in out
    assert out.endswith(text), "its else action stays with it"


def test_the_lines_after_the_statement_stay_where_they_were():
    text = "// ap : assert property (old);\nap : assert property (\n    a\n  |-> b);\nnext_line;\n"
    out = split.split_statement(text, "ap", ["c"])
    assert out.count("\n") == text.count("\n")
    assert out.splitlines()[0] == "// ap : assert property (old);", "a comment is not the statement"
    assert out.splitlines()[4] == "next_line;"


@pytest.mark.parametrize("text, cases, message", [
    ("ap : assert property (a);", [], "at least one case"),
    ("ap : assert property (a);", ["x); evil: assert property (1"], "not one expression"),
    ("other : assert property (a);", ["c"], "was not found"),
    ("ap : assert property (a); ap : assert property (b);", ["c"], "2 times"),
    ("xap : assert property (a);", ["c"], "was not found"),
])
def test_what_cannot_be_split_is_refused(text, cases, message):
    with pytest.raises(split.SplitError, match=message):
        split.split_statement(text, "ap", cases)


# ── The command ───────────────────────────────────────────────

@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    s = Session()
    s.files.update({"pair.sv": PAIR, "pair_sva.sv": PAIR_SVA})
    yield s
    s.close()


def run(session, *lines, timeout=300):
    for line in lines:
        session.submit(line)
    assert session.wait_idle(timeout)


def errors(session):
    return [e["text"] for e in session.events if e["kind"] == "error"]


SETUP = ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n")


@needs_tcl
@requires_yosys
def test_case_split_puts_the_cases_under_the_assertion(session):
    run(session, *SETUP, "case_split -property {*ap_full_stays} -cases {{qa == 3'd7} {qa < 3'd4}}")
    assert not errors(session), errors(session)
    family = [(p.id, p.related, p.expr) for p in session.props.values() if p.parent == "ap_full_stays"]
    assert family == [("ap_full_stays__case1", "case", "qa == 3'd7"), ("ap_full_stays__case2", "case", "qa < 3'd4"),
                      ("ap_full_stays__case_rest", "case", "none of the cases"),
                      ("ap_full_stays:precondition1", "precondition", ""), ("ap_full_stays:witness1", "witness", "")], \
        "the cases, and its related covers stay"
    assert session.props["ap_full_stays__case2"].name == "pair.i_sva.ap_full_stays:case2"
    assert list(session.props)[:4] == ["ap_full_stays", "ap_full_stays__case1", "ap_full_stays__case2",
                                       "ap_full_stays__case_rest"], "right under their assertion"
    assert session.splits == {"ap_full_stays": ["qa == 3'd7", "qa < 3'd4"]}
    # the other assertions keep their related covers
    assert {p.related for p in session.props.values() if p.parent == "ap_bad"} == {"precondition", "witness"}


@needs_tcl
@requires_yosys
def test_cases_that_do_not_compile_change_nothing(session):
    run(session, *SETUP)
    before = list(session.props)
    run(session, "case_split -property {*ap_full_stays} -cases {{no_such_signal == 1}}")
    assert any("do not compile" in t for t in errors(session)) and any("no_such_signal" in t for t in errors(session))
    assert list(session.props) == before and session.splits == {}
    run(session, "case_split -property {*cp_full} -cases {{qa == 0}}")
    assert any("is not an assertion" in t for t in errors(session))


@needs_tcl
@requires_yosys
def test_clear_brings_the_related_covers_back(session):
    run(session, *SETUP)
    before = list(session.props)
    run(session, "case_split -property {*ap_full_stays} -cases {{qa == 3'd7}}",
        "case_split -property {*ap_full_stays} -clear")
    assert not errors(session) and list(session.props) == before and session.splits == {}


@needs_tcl
@requires_sby
def test_a_split_assertion_is_proven_when_all_its_cases_are(session):
    run(session, *SETUP,
        "case_split -property {*ap_full_stays} -cases {{qa == 3'd7} {qa < 3'd4} {qa == 3'd7 && !fa}}",
        "prove -property {*ap_full_stays}")
    assert not errors(session), errors(session)
    props = session.props
    assert {p.id: p.status for p in props.values() if p.parent == "ap_full_stays"} == {
        "ap_full_stays__case1": "proven", "ap_full_stays__case2": "proven", "ap_full_stays__case3": "proven",
        "ap_full_stays__case_rest": "proven",
        "ap_full_stays:precondition1": "covered", "ap_full_stays:witness1": "covered"}
    assert props["ap_full_stays:witness1"].has_trace, "a covered related cover has its trace"
    assert props["ap_full_stays__case3"].detail == "this case cannot occur"       # fa is &qa
    parent = props["ap_full_stays"]
    assert parent.status == "proven" and parent.detail == "all 4 cases are proven" and parent.engine == "case split"
    assert parent.seconds is not None
    log = [e["text"] for e in session.events]
    assert sum('"pair.i_sva.ap_full_stays" was proven' in t for t in log) == 1
    assert "determined" in [e["text"] for e in session.events if e["kind"] == "out"]
    assert props["ap_in_range"].status == "not_run", "only what was asked for"


@needs_tcl
@requires_sby
def test_a_counterexample_of_a_case_is_one_of_the_assertion(session):
    run(session, *SETUP, "case_split -property {*ap_bad} -cases {{qa == 3'd4} {qa == 3'd0}}", "prove -all")
    assert not errors(session), errors(session)
    props = session.props
    assert props["ap_bad__case1"].status == "cex" and props["ap_bad__case1"].has_trace
    assert props["ap_bad__case2"].status == "proven" and props["ap_bad__case_rest"].status == "proven"
    assert props["ap_bad"].status == "cex" and "fails in case1" in props["ap_bad"].detail
    assert props["ap_full_stays"].status == "proven" and props["ap_full_stays:witness1"].status == "covered"
    summary = session.summary()
    assert summary["case"] == {"cex": 1, "total": 3, "proven": 2}
    assert summary["assert"]["cex"] == 1 and summary["assert"]["total"] == 4


@needs_tcl
@requires_sby
def test_a_split_assertion_that_passes_only_vacuously_is_still_shown_so(session):
    """The related covers of a split assertion are checked on the assertion itself."""
    run(session, *SETUP, "case_split -property {*ap_vacuous} -cases {{qa == 3'd0}}", "prove -property {*ap_vacuous}")
    assert not errors(session), errors(session)
    props = session.props
    assert props["ap_vacuous"].status == "vacuous", "every case holds, but only because nothing ever matches"
    assert "can never match" in props["ap_vacuous"].detail
    assert {c.status for c in props.values() if c.parent == "ap_vacuous" and c.related == "case"} == {"proven"}
    assert props["ap_vacuous:precondition1"].status == "unreachable"
    assert props["ap_vacuous:witness1"].status == "unreachable"
    assert any("ap_vacuous:precondition1" in e["text"] and "unreachable" in e["text"] for e in session.events)


# ── Cases Praman makes ────────────────────────────────────────

def test_lowest_bit_cases_cover_every_nonzero_value_once():
    cases, descriptions = split.lowest_bit_cases("d", 4)
    assert len(cases) == 4 and descriptions[2] == "lowest 1-bit of (d) is bit 2"
    # evaluate the case expressions as Python for every value of a 4-bit d
    for d in range(16):
        hits = [i for i, case in enumerate(cases)
                if eval(case.replace("4'd1", "1").replace("{4{1'b1}}", "15").replace("&&", " and "),
                        {"d": d})]
        assert hits == ([] if d == 0 else [(d & -d).bit_length() - 1]), (d, hits)


def test_value_cases_and_their_limit():
    cases, descriptions = split.value_cases("mode", 2)
    assert cases == ["(mode) == 2'd0", "(mode) == 2'd1", "(mode) == 2'd2", "(mode) == 2'd3"]
    with pytest.raises(split.SplitError, match="11 bits wide"):
        split.value_cases("wide", 11)


@needs_tcl
@requires_sby
def test_split_by_the_lowest_bit_in_one_line(session):
    run(session, *SETUP, "case_split -property {*ap_full_stays} -lowest_bit {pair.qa}", "prove -property {*ap_full_stays}")
    assert not errors(session), errors(session)
    cases = [p for p in session.props.values() if p.parent == "ap_full_stays" and p.related == "case"]
    assert [c.expr for c in cases] == ["lowest 1-bit of (pair.qa) is bit 0", "lowest 1-bit of (pair.qa) is bit 1",
                                       "lowest 1-bit of (pair.qa) is bit 2", "none of the cases"], \
        "a hierarchical name works too"
    assert all(c.status == "proven" for c in cases) and session.props["ap_full_stays"].status == "proven"
    assert any("pair.qa is 3 bits wide: 3 cases" in e["text"] for e in session.events)


@needs_tcl
@requires_sby
def test_split_by_values_in_one_line(session):
    run(session, *SETUP, "case_split -property {*ap_bad} -values {qa}", "prove -property {*ap_bad}")
    assert not errors(session), errors(session)
    cases = [p for p in session.props.values() if p.parent == "ap_bad" and p.related == "case"]
    assert len(cases) == 9 and cases[4].expr == "(qa) == 4"
    assert session.props["ap_bad__case5"].status == "cex", "the counterexample is in the case qa == 4"
    assert session.props["ap_bad"].status == "cex"


@needs_tcl
@requires_yosys
def test_what_a_one_line_split_refuses(session):
    run(session, *SETUP)
    before = list(session.props)
    for line, message in [
        ("case_split -property {*ap_bad} -lowest_bit {no_such_signal}", "is not an expression at the place"),
        ("case_split -property {*ap_bad} -values {qa} -lowest_bit {qa}", "say how to split"),
        ("case_split -property {*ap_bad}", "say how to split"),
    ]:
        session.events.clear()
        run(session, line)
        assert any(message in t for t in errors(session)), (line, errors(session))
    assert list(session.props) == before and session.splits == {}
