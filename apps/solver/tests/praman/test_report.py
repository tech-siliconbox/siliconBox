"""
Verification report (GET /api/formal/report/{job_id}): one self-contained
HTML file with the run settings, every verdict, the explained traces and
the input hashes.  User text is escaped.
"""

import hashlib


import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.formal_service import FormalJob
from app.praman.services.report import build_report
from app.praman.services.sby_generator import SbyResult
from tests.praman.conftest import requires_sby

DUT = """module cnt (input clk, input rst_n, input en, output reg [2:0] q);
  always @(posedge clk) if (!rst_n) q <= 0; else if (en) q <= q + 1;
endmodule
"""
SVA = """module cnt_sva ();
  a_below_7 : assert property (@(posedge cnt.clk) disable iff (!cnt.rst_n) cnt.q != 3'd7);
  a_hold    : assert property (@(posedge cnt.clk) disable iff (!cnt.rst_n) !cnt.en |=> $stable(cnt.q));
  c_two     : cover property (@(posedge cnt.clk) cnt.q == 3'd2);
endmodule
bind cnt cnt_sva u ();
"""




def _job(**result) -> FormalJob:
    return FormalJob(job_id="fv_unit", status="complete", created_at="2026-10-16T10:00:00",
                     dut_code="<script>alert(1)</script>", dut_filename="d.sv", sva_code="", mode="prove",
                     depth=12, result=SbyResult(status="FAIL", **result))


def test_report_lists_settings_and_verdicts_and_escapes_user_text():
    job = _job(assertion_results=[
        {"name": "a_ok", "type": "ASSERT", "verdict": "PROVEN", "engine": "abc pdr / k-induction",
         "verdict_detail": "Holds for all reachable states (full proof)."},
        {"name": "a_<b>", "type": "ASSERT", "verdict": "FAIL", "step": 5, "verdict_detail": "Counterexample at step 5."},
        {"name": "c_x", "type": "COVER", "verdict": "UNREACHABLE", "verdict_detail": "Can never be reached (proven)."},
    ], harness={"signal": "rst_n", "active_low": True, "source": "sva", "clocks": ["clk"], "multiclock": False},
        sanity={"status": "OK", "message": "Design runs the whole BMC depth."})
    html = build_report(job)
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html
    assert "a_&lt;b&gt;" in html and "a_<b>" not in html
    assert "rst_n (active low, sva)" in html and "Depth (cycles)</td><td>12" in html
    assert ">Proven<" in html and ">Fail<" in html and ">Unreachable<" in html
    assert hashlib.sha256(job.dut_code.encode()).hexdigest() in html
    assert "<script" not in html.replace("&lt;script", "")   # nothing executable


@requires_sby
def test_report_of_a_run_explains_its_traces(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="cnt.sv", mode="prove", depth=12, project_name="fv_report")
    assert job.result is not None, job.error_message
    html = build_report(job)
    assert "Counterexample: <code>a_below_7</code>" in html and "`a_below_7` fails at cycle" in html
    assert "Cover witness: <code>c_two</code>" in html
    assert "<th class='name'>cycle</th>" in html            # per-cycle table
    assert "smtbmc" in html and "abc pdr / k-induction" in html
    assert hashlib.sha256(SVA.encode()).hexdigest() in html
