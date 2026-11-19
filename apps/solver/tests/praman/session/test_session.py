"""A Praman session driven by Tcl commands (app/praman/session.py, commands.py)."""

import subprocess
import time

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.session import Session
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby, requires_yosys
from tests.praman.session.designs import HARD, PAIR, PAIR_SVA, PM_TCL

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")


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


def texts(session, kind=None):
    return [e["text"] for e in session.events if kind is None or e["kind"] == kind]


def errors(session):
    return texts(session, "error")


# ── analyze ───────────────────────────────────────────────────

def test_nothing_happens_until_a_command_is_run(session):
    assert session.phase == "empty" and not session.props and session.tree is None


def test_analyze_reads_session_files(session):
    run(session, "analyze -sv pair.sv pair_sva.sv")
    assert session.phase == "analyzed" and [n for n, _ in session.analyzed] == ["pair.sv", "pair_sva.sv"]
    assert not session.props, "properties appear at elaborate, not at analyze"


def test_analyze_reports_syntax_errors_with_file_and_line(session):
    session.files["bad.sv"] = "module m(input a);\n  assign b = ;\nendmodule\n"
    run(session, "analyze -sv pair.sv bad.sv")
    assert any(text.startswith("bad.sv(2): ") for text in errors(session))
    assert session.phase == "empty" and not session.analyzed


def test_analyze_a_missing_file_is_an_error(session):
    run(session, "analyze -sv nowhere.sv")
    assert any("nowhere.sv" in text and "not among the session files" in text for text in errors(session))


def test_analyze_reads_a_file_list(session):
    session.files["files.f"] = "// sources\npair.sv\n+incdir+rtl\npair_sva.sv  # the checker\n"
    run(session, "analyze -sv09 -f files.f")
    assert [n for n, _ in session.analyzed] == ["pair.sv", "pair_sva.sv"]


def test_a_script_path_from_another_machine_finds_the_uploaded_file(session):
    run(session, "analyze -sv /home/user/units/pair/source/sv/rtl/pair.sv")
    assert [n for n, _ in session.analyzed] == ["pair.sv"]


# ── elaborate ─────────────────────────────────────────────────

@requires_yosys
def test_elaborate_fills_hierarchy_and_property_table(session):
    run(session, "analyze -sv pair.sv", "analyze -sv pair_sva.sv", "elaborate -top pair")
    assert not errors(session)
    assert session.phase == "elaborated" and session.top == "pair"
    tree = session.tree
    assert tree["path"] == "pair" and tree["module"] == "pair"
    assert {(c["name"], c["module"]) for c in tree["children"]} == {
        ("u_a", "cnt"), ("u_b", "cnt"), ("i_sva", "pair_sva")}
    props = session.props
    assert props["ap_full_stays"].name == "pair.i_sva.ap_full_stays"
    assert props["ap_full_stays"].file == "pair_sva.sv" and props["ap_full_stays"].line == 2
    assert props["cp_full"].type == "cover"
    # an assertion with an antecedent has its precondition cover, one without has none
    assert props["ap_full_stays:precondition1"].parent == "ap_full_stays"
    assert props["ap_full_stays:precondition1"].related == "precondition"
    assert "ap_in_range:precondition1" not in props
    assert all(p.status == "not_run" for p in props.values())
    assert all(p.started_at is None and p.seconds is None for p in props.values())
    assert [p["name"] for p in session.ports if p["direction"] == "input"] == ["clk", "rst_n", "en_a", "en_b"]


@requires_yosys
def test_elaborate_without_top_takes_the_only_candidate(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate")
    assert session.top == "pair"


@requires_yosys
def test_elaborate_an_unknown_top_is_an_error(session):
    run(session, "analyze -sv pair.sv", "elaborate -top nope")
    assert session.phase == "analyzed" and errors(session)


def test_elaborate_before_analyze_is_an_error(session):
    run(session, "elaborate -top pair")
    assert any("nothing is analyzed" in text for text in errors(session))


# ── clock / reset ─────────────────────────────────────────────

@requires_yosys
def test_clock_and_reset(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair")
    assert session.clock is None and session.reset is None
    run(session, "clock clk", "reset !rst_n")
    assert session.clock == "clk" and session.reset == ("rst_n", True)
    run(session, "reset -expr {rst_n}")
    assert session.reset == ("rst_n", False)
    run(session, "reset ~rst_n")
    assert session.reset == ("rst_n", True)
    run(session, "clock -none", "reset -none")
    assert session.clock == "" and session.reset == ("", False)
    assert not errors(session)


@requires_yosys
def test_clock_must_be_an_input_of_the_top(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock qa", "reset !u_a.rst_n")
    assert len(errors(session)) == 2 and session.clock is None and session.reset is None


def test_clock_before_elaborate_is_an_error(session):
    run(session, "clock clk")
    assert any("no design is elaborated" in text for text in errors(session))


# ── scripts ───────────────────────────────────────────────────

@requires_yosys
def test_commands_a_script_cannot_mean_here_stop_it(session):
    session.files["s.tcl"] = "analyze -sv pair.sv pair_sva.sv\nelaborate -top pair\nrestrict {en_a}\nclock clk\n"
    run(session, "source s.tcl")
    assert any('"restrict" is not available' in text and '(file "s.tcl" line 3)' in text for text in errors(session))
    assert session.phase == "elaborated" and session.clock is None, "the script stopped at the restrict"


@requires_yosys
def test_engine_settings_of_other_tools_are_accepted(session):
    session.files["s.tcl"] = ("set_message -disable VERI-2418\nset_proofgrid_per_engine_max_local_jobs 2\n"
                              "analyze -sv pair.sv pair_sva.sv\nelaborate -top pair -create_related_covers "
                              "{precondition witness} -no_type_properties -bbox_a 2000\n")
    run(session, "source s.tcl")
    assert not errors(session) and session.phase == "elaborated"


def test_the_journal_reproduces_the_session(session):
    run(session, "set x 1", "analyze -sv pair.sv")
    assert session.journal == ["set x 1", "analyze -sv pair.sv"]


# ── prove ─────────────────────────────────────────────────────

@requires_sby
def test_the_manual_script_proves_the_design(session):
    run(session, "source pm.tcl")
    assert not errors(session), errors(session)
    status = {p.id: p.status for p in session.props.values()}
    witness_of_bad = status.pop("ap_bad:witness1")       # passes of a failing assertion: either way
    assert witness_of_bad in ("covered", "undetermined")
    assert status == {
        "ap_full_stays": "proven", "ap_full_stays:precondition1": "covered", "ap_full_stays:witness1": "covered",
        "ap_in_range": "proven", "cp_full": "covered",
        "ap_bad": "cex", "ap_bad:precondition1": "covered",
        "ap_vacuous": "vacuous", "ap_vacuous:precondition1": "unreachable", "ap_vacuous:witness1": "unreachable",
    }
    bad = session.props["ap_bad"]
    assert bad.has_trace and bad.bound and bad.job_id == session.proof.job_id
    assert all(p.seconds is not None and p.started_at for p in session.props.values())
    log = texts(session)
    assert any(t.startswith('A counterexample (cex) with') and '"pair.i_sva.ap_bad"' in t for t in log)
    assert any('"pair.i_sva.ap_full_stays" was proven' in t for t in log)
    assert any("SUMMARY" in t for t in log)
    assert "determined" in texts(session, "out")     # what prove returns
    assert [e["depth"] for e in session.events if e["kind"] == "cmd" and e["text"] == "prove -all"] == [1]
    assert not session.proof.running


@requires_sby
def test_prove_one_property_leaves_the_others_not_run(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n",
        "prove -property {pair.i_sva.ap_in_range}")
    status = {p.id: p.status for p in session.props.values()}
    assert status["ap_in_range"] == "proven"
    assert all(s == "not_run" for name, s in status.items() if name != "ap_in_range")


@requires_sby
def test_changing_the_reset_clears_the_results(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n",
        "prove -property {*ap_in_range}")
    assert session.props["ap_in_range"].status == "proven"
    run(session, "reset rst_n")
    assert session.props["ap_in_range"].status == "not_run"
    assert any("Clearing proof results" in t for t in texts(session, "info"))


@requires_sby
def test_stop_ends_a_background_proof(session):
    run(session, "analyze -sv hard.sv", "elaborate -top hard", "clock clk", "reset -none", "prove -all -bg",
        background=True)
    assert session.proof.running and session.props["ap_assoc"].status == "running"
    assert "background 1" in texts(session, "out")
    time.sleep(1.5)
    began = time.time()
    session.submit("stop")
    assert session.wait_idle(60)
    assert time.time() - began < 30, "the solvers were not stopped"
    assert session.props["ap_assoc"].status == "stopped"
    assert not session.proof.running
    # no solver of the run is left behind (sby starts them in process groups of their own)
    job = session.proof.job_id
    for _ in range(40):
        left = [line for line in subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True).stdout.splitlines()
                if job in line]
        if not left:
            break
        time.sleep(0.25)
    assert not left, left


@requires_sby
def test_the_time_limit_of_a_proof_stops_it(session):
    run(session, "analyze -sv hard.sv", "elaborate -top hard", "clock clk", "reset -none",
        "prove -all -time_limit 2s", timeout=90)
    assert session.props["ap_assoc"].status == "stopped"
    assert "time limit" in session.props["ap_assoc"].detail
    assert "undetermined" in texts(session, "out")


# ── related covers ────────────────────────────────────────────

@requires_yosys
def test_precondition_and_witness_covers_are_made_by_default(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair")
    assert {p.related for p in session.props.values() if p.parent} == {"precondition", "witness"}
    run(session, "elaborate -top pair -create_related_covers {precondition}")
    assert {p.related for p in session.props.values() if p.parent} == {"precondition"}


@requires_yosys
def test_witness_covers_are_made_on_request(session):
    run(session, "analyze -sv pair.sv pair_sva.sv",
        "elaborate -top pair -create_related_covers {precondition witness}")
    assert not errors(session)
    related = {p.id: p.related for p in session.props.values() if p.parent}
    assert related == {
        "ap_full_stays:precondition1": "precondition", "ap_full_stays:witness1": "witness",
        "ap_bad:precondition1": "precondition", "ap_bad:witness1": "witness",
        "ap_vacuous:precondition1": "precondition", "ap_vacuous:witness1": "witness",
    }
    assert session.props["ap_full_stays:witness1"].name == "pair.i_sva.ap_full_stays:witness1"


@requires_yosys
def test_related_covers_can_be_switched_off_or_misnamed(session):
    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair -create_related_covers {none}")
    assert not [p for p in session.props.values() if p.parent]
    run(session, "elaborate -top pair -create_related_covers {precondition wittness}")
    assert any('unknown kind "wittness"' in text for text in errors(session))


@requires_sby
def test_witness_covers_are_proved_with_their_assertions(session):
    run(session, "analyze -sv pair.sv pair_sva.sv",
        "elaborate -top pair -create_related_covers {precondition witness}",
        "clock clk", "reset !rst_n", "prove -all")
    assert not errors(session), errors(session)
    status = {p.id: p.status for p in session.props.values()}
    assert status["ap_full_stays"] == "proven"
    assert status["ap_full_stays:precondition1"] == "covered" and status["ap_full_stays:witness1"] == "covered"
    # a |=> b: the witness is one cycle after the precondition
    assert session.props["ap_full_stays:witness1"].bound == session.props["ap_full_stays:precondition1"].bound + 1
    assert status["ap_vacuous"] == "vacuous"
    assert status["ap_vacuous:precondition1"] == "unreachable" and status["ap_vacuous:witness1"] == "unreachable"
    assert status["ap_bad"] == "cex" and status["ap_bad:precondition1"] == "covered"
    assert status["ap_bad:witness1"] in ("covered", "undetermined")
    assert any('"pair.i_sva.ap_full_stays:witness1" was covered' in t for t in texts(session))
    assert {p.id for p in session.props.values() if not p.parent} == {
        "ap_full_stays", "ap_in_range", "cp_full", "ap_bad", "ap_vacuous"}


# ── time limits ───────────────────────────────────────────────

def test_scan_limits_rise_to_the_per_property_limit():
    from app.praman.commands import scan_limits
    assert scan_limits(300) == [10, 100, 300]
    assert scan_limits(7200) == [10, 100, 1000, 7200]
    assert scan_limits(10) == [10] and scan_limits(5) == [5]


@requires_sby
def test_a_proof_that_needs_longer_is_tried_again_and_logged(session, monkeypatch):
    """The per-property limit is honoured (no fixed cap): a proof that does
    not finish in one scan gets the next, longer one."""
    import app.praman.services.formal_service as fs
    from app.praman.services.sby_generator import SbyResult
    real = fs.FormalService._run_sby
    limits = []

    def run_sby(self, sby_file, work_dir, timeout=300):
        name = sby_file.rsplit("/", 1)[-1]
        if "ap_in_range_prove" in name or "__prove0" in name:
            limits.append(timeout)
            if timeout < 500:           # this proof "needs" 500 s
                return SbyResult(status="TIMEOUT", return_code=-1, error_message="simulated")
        return real(self, sby_file, work_dir, timeout)
    monkeypatch.setattr(fs.FormalService, "_run_sby", run_sby)

    run(session, "analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n",
        "set_prove_per_property_time_limit 20m", "prove -property {*ap_in_range}")
    assert session.props["ap_in_range"].status == "proven"
    allowance = limits[0] - 10          # for building the model, the same for every run
    assert 0 <= allowance <= 20
    assert [limit - allowance for limit in limits] == [10, 10, 100, 1000], \
        "batched proof, then scans of 10 s, 100 s and 1000 s"
    assert all(not c.engine.startswith("scan") for c in session.props.values() if c.parent), \
        "a related cover does not keep the scan it waited in as its engine"
    engine = [e["text"] for e in session.events if e["kind"] == "engine" and e.get("code") == "PMI044"]
    assert len(engine) == 2 and "time limit expired (10 s)" in engine[0] and "again with 1000 s" in engine[1]
    assert any("scans of 10s, 100s, 1000s, 1200s" in t for t in texts(session, "info"))


# ── file names ────────────────────────────────────────────────

@requires_sby
def test_file_names_with_spaces_and_brackets_work(session):
    """A downloaded copy is called "pair (1).sv": Yosys must still be able to read the design."""
    session.files = {"pair (1).sv": session.files["pair.sv"], "pair_sva (1).sv": session.files["pair_sva.sv"]}
    run(session, "analyze -sv {pair (1).sv}", "analyze -sv {pair_sva (1).sv}", "elaborate -top pair",
        "clock clk", "reset !rst_n", "prove -property {*ap_in_range *ap_bad}")
    assert not errors(session), errors(session)
    assert session.props["ap_in_range"].status == "proven" and session.props["ap_bad"].status == "cex"
    assert session.props["ap_bad"].file == "pair_sva (1).sv" and session.props["ap_bad"].line == 5, \
        "results name the files as they were uploaded"
    assert session.tree["file"] == "pair (1).sv"


def test_the_written_script_quotes_such_names():
    from app.praman import sources
    script, _ = sources.default_script({"pair (1).sv": PAIR, "pair_sva (1).sv": PAIR_SVA})
    assert "analyze -sv {pair (1).sv}" in script and "analyze -sv {pair_sva (1).sv}" in script
