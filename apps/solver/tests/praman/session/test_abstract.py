"""abstract (-init_value / -counter) and task -create, as in JasperGold."""

import pytest

from app.praman.tclhost import tclsh_path
from app.praman.services.formal_service import design_edits
from tests.praman.conftest import requires_sby, requires_yosys
from tests.praman.session.test_session import run, session  # noqa: F401  (fixture)

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")
SETUP = ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n")


def status(s):
    return {p.id: p.status for p in s.props.values()}


def errors(s):
    return [e["text"] for e in s.events if e["kind"] == "error"]


def test_the_yosys_commands_of_an_abstraction():
    edits = design_edits("top", ["init:u.q", "counter:u.n", "u.cut"])
    assert "abstract -state -enable __va_in_reset top/w:u.q" in edits, "free while the reset is held"
    assert edits.index("add -wire __pm_jump_1 1 top") < edits.index("cutpoint top/w:__pm_jump_1") \
        < edits.index("abstract -state -enable __pm_jump_1 top/w:u.n"), "a free jump in any cycle"
    assert "select -assert-min 1 top/w:u.q %ci1 top/t:*ff* %i" in edits, "a register, or the run stops"
    assert "cutpoint top/w:u.cut" in edits and edits[-1] == "opt_clean"


@requires_sby
def test_an_initial_value_abstraction_frees_the_register_after_reset(session):
    run(session, *SETUP, "assume -name a_still {!en_a}", "assert -name t_stays_zero {qa == 3'd0}",
        "prove -property {t_stays_zero ap_in_range}")
    assert status(session)["t_stays_zero"] == "proven", "reset to 0 and never counts"
    run(session, "abstract -init_value {u_a.q}", "prove -property {t_stays_zero ap_in_range}")
    st = status(session)
    assert st["t_stays_zero"] == "cex", "after reset u_a.q holds any value"
    assert st["ap_in_range"] == "proven", "what holds for every value still holds"
    assert session.commands.call("abstract", ["-list"]) == "u_a.q"
    assert any("abstract                    = u_a.q (initial value)" in e["text"] for e in session.events)
    run(session, "abstract -remove {u_a.q}", "prove -property {t_stays_zero}")
    assert status(session)["t_stays_zero"] == "proven"


@requires_sby
def test_a_counter_abstraction_lets_the_counter_jump(session):
    run(session, *SETUP, "assume -name a_still {!en_a}", "assert -name t_stays_zero {qa == 3'd0}",
        "abstract -counter {u_a.q}", "prove -property {t_stays_zero ap_in_range}")
    st = status(session)
    assert st["t_stays_zero"] == "cex", "it may jump although it is never enabled"
    assert st["ap_in_range"] == "proven"
    for line in ("abstract -counter {fa}", "abstract -counter {u_a.full}", "abstract -counter {nope}",
                 "abstract {u_a.q}"):
        session.submit(line)
        assert session.wait_idle(60)
    assert any('"fa" is not a register' in e or '"u_a.full" is not a register' in e for e in errors(session))
    assert any('"nope" is not a signal of the design' in e for e in errors(session))
    assert any("give one of -init_value and -counter" in e for e in errors(session))
    run(session, "abstract -clear", "prove -property {t_stays_zero}")
    assert status(session)["t_stays_zero"] == "proven" and session.abstracts == []


@requires_sby
def test_a_task_proves_its_copies_under_its_own_assumptions(session):
    run(session, *SETUP, "assume -name a_never_a {!en_a}", "prove -property {ap_bad}")
    assert status(session)["ap_bad"] == "vacuous", "en_a never holds in <embedded>"
    run(session, "task -create t_free -copy {ap_bad} -set", "prove -all")
    st = status(session)
    assert session.task == "t_free" and st["t_free::ap_bad"] == "cex", "the task has no assumption"
    assert st["ap_bad"] == "vacuous", "the embedded row keeps its result"
    assert session.props["t_free::ap_bad"].name == "t_free::pair.i_sva.ap_bad"
    assert session.props["t_free::ap_bad"].has_trace
    run(session, "task -create t_same -copy {<embedded>::ap_bad} -copy_assumes -set", "prove -all")
    assert status(session)["t_same::ap_bad"] == "vacuous", "it took the assumptions along"
    assert session.commands.call("task", ["-list"]) == "<embedded> t_free t_same"

    # an assumption written in a task belongs to it alone
    run(session, "task -set t_free", "assume -name a_b_only {!en_b}", "prove -task t_free")
    assert session.props["t_free::a_b_only"].task == "t_free"
    assert status(session)["t_free::ap_bad"] == "cex"
    run(session, "task -set <embedded>", "prove -property {ap_bad}")
    assert status(session)["ap_bad"] == "vacuous"
    assert any("task                        = t_free" in e["text"] for e in session.events)

    session.submit("prove -property {ap_bad t_free::ap_bad}")
    assert session.wait_idle(60)
    assert any("prove one task at a time" in e for e in errors(session))
    run(session, "task -remove t_free")
    assert not any(p.task == "t_free" for p in session.props.values()) and "t_free" not in session.tasks


@requires_sby
def test_a_trace_of_a_task_copy_opens(session):
    from app.praman.services.counterexample import trace_payload
    from app.praman.services.formal_service import get_job
    from app.praman.commands import label_of
    run(session, *SETUP, "task -create t_one -copy {ap_bad}", "prove -task t_one")
    prop = session.props["t_one::ap_bad"]
    assert prop.status == "cex"
    payload = trace_payload(get_job(prop.job_id), label_of(prop.id))
    assert payload and payload["vcd_data"]["signal_details"]


@requires_yosys
def test_tasks_and_abstractions_are_kept_with_the_session(session):
    run(session, *SETUP, "abstract -init_value {u_b.q}", "task -create t_k -copy {ap_full_stays} -set")
    state = session._state()
    assert state["abstracts"] == ["init:u_b.q"] and state["tasks"] == ["t_k"] and state["task"] == "t_k"
    run(session, "elaborate -top pair")
    assert session.abstracts == [] and session.tasks == [] and session.task == ""
