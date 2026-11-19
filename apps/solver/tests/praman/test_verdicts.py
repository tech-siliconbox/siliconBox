"""
Fast checks for the verdict machinery: precondition covers in the compiled
monitors, monitor isolation, unsupported markers and step extraction from
sby logs.  No formal tools needed.
"""

from app.praman.services.formal_service import FormalService
from app.praman.services.sby_generator import _steps_from_log
from app.praman.services.sva.compiler import PRECONDITION_SUFFIX
from app.praman.services.sva.pipeline import prepare

SVA = """
module chk (input clk, input rst_n, input req, input gnt, input busy);
  property p_req_gnt;
    @(posedge clk) disable iff (!rst_n) req |=> gnt;
  endproperty
  ap_req_gnt : assert property(p_req_gnt);
  wp_busy    : cover property (@(posedge clk) disable iff (!rst_n) (busy && req));
endmodule
"""


def _monitor(sva: str = SVA) -> str:
    return prepare({}, {"sva.sv": sva}).monitor_text


def test_assertions_get_precondition_covers():
    rtl = _monitor()
    assert f"ap_req_gnt{PRECONDITION_SUFFIX}: cover(1);" in rtl
    # Precondition covers are not reported as properties of their own
    assert FormalService()._extract_lowered_assert_labels(rtl) == ["ap_req_gnt", "wp_busy"]


def test_isolate_keeps_only_the_active_statement():
    service = FormalService()
    rtl = service._isolate(_monitor(), "ap_req_gnt")
    assert "ap_req_gnt: assert(0);" in rtl
    assert "wp_busy: cover(" not in rtl
    assert f"ap_req_gnt{PRECONDITION_SUFFIX}: cover(" not in rtl


def test_isolate_as_assert_turns_a_cover_into_a_proof_obligation():
    rtl = FormalService()._isolate(_monitor(), "wp_busy", as_assert=True)
    assert "wp_busy: assert(0);" in rtl
    assert "wp_busy: cover(" not in rtl


def test_unsupported_assertions_are_reported():
    sva = """
module chk (input clk, input rst_n, input req, input gnt);
  ap_two_clocks : assert property (@(posedge clk) req |-> (req and @(negedge clk) gnt));
endmodule
"""
    service = FormalService()
    rtl = _monitor(sva)
    unsupported = service._unsupported_labels(rtl)
    assert set(unsupported) == {"ap_two_clocks"}
    assert unsupported["ap_two_clocks"][0] == "ASSERT"
    assert "clock switch is supported only" in unsupported["ap_two_clocks"][1]
    assert service._extract_lowered_assert_labels(rtl) == []


def test_steps_from_sby_log():
    log = "\n".join([
        "engine_0: ##   0:00:00  Checking assertions in step 5..",
        "engine_0: ##   0:00:00  Checking assertions in step 6..",
        "engine_0: ##   0:00:00  Assert failed in formal_wrapper.u_monitor: ap_x",
        "engine_0: ##   0:00:00  Reached cover statement in step 10 at formal_wrapper.u_monitor: wp_y",
    ])
    assert _steps_from_log(log) == {"ap_x": 6, "wp_y": 10}


def _prove_result(status: str, engine_log: str, stdout: str = ""):
    from app.praman.services.sby_generator import SbyResult
    return SbyResult(status=status, engine_output=stdout, detailed_logs={"engine_log": engine_log})


def test_proof_chunk_reports_proven_only_when_every_property_is_decided():
    from app.praman.services.formal_service import _proven_in_chunk
    chunk = ["a1", "a2", "a3"]
    decided = "Properties:  All = 3. Proved = 2. Disproved = 1. Undecided = 0.   Time = 0.03 sec"
    failed = "summary:   failed assertion top.__va_mon.a2 at mon.sv:12.1-12.9 step 5"
    assert _proven_in_chunk(_prove_result("FAIL", decided, failed), chunk) == {"a1", "a3"}

    all_proved = "Properties:  All = 3. Proved = 3. Disproved = 0. Undecided = 0.   Time = 0.01 sec"
    assert _proven_in_chunk(_prove_result("PASS", all_proved), chunk) == set(chunk)

    undecided = "Properties:  All = 3. Proved = 1. Disproved = 0. Undecided = 2.   Time = 120 sec"
    assert _proven_in_chunk(_prove_result("FAIL", undecided), chunk) == set()
    assert _proven_in_chunk(_prove_result("TIMEOUT", ""), chunk) == set()
    assert _proven_in_chunk(_prove_result("PASS", ""), chunk) == set()   # no engine summary


def test_full_proofs_race_pdr_and_k_induction(tmp_path):
    from app.praman.services.formal_service import PROOF_ENGINES
    from app.praman.services.sby_generator import generate_files_project
    project = generate_files_project(str(tmp_path / "p"), "p", {"d.sv": "module d; endmodule\n"}, "d",
                                     mode="prove", engine=PROOF_ENGINES)
    text = open(project.sby_file).read()
    engines = text.split("[engines]\n")[1].split("\n\n")[0].splitlines()
    assert engines == ["abc pdr", "smtbmc yices"]
