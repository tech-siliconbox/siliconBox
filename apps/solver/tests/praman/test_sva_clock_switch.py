"""
Assertions that switch clocks (IEEE 1800 16.13): `@(posedge c1) a |->
@(posedge c2) b` starts b at the first c2 tick at or after the c1 tick where
a matched, |=> strictly after; in a sequence, `a ##1 @(posedge c2) b` (##0:
at or after) works the same way, and what follows stays on c2.  Checked on
a clock-domain crossing with free, unrelated clocks, and on two names of one
clock (every tick coincides).
"""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.pipeline import prepare
from tests.praman.conftest import requires_sby

# A sticky request in the clk_a domain, synchronised into clk_b by two flops
DUT = """module cdc (input clk_a, input clk_b, input rst_n, input go, output reg req, output reg ack);
  always @(posedge clk_a) if (!rst_n) req <= 0; else if (go) req <= 1;
  reg s1, s2;
  always @(posedge clk_b) if (!rst_n) {s1, s2, ack} <= 3'b0; else {s1, s2, ack} <= {req, s1, s2};
endmodule
"""
SVA = """module cdc_sva ();
  // ack is sampled 1 at the 4th clk_b tick after the request at the latest
  a_ack  : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            $rose(cdc.req) |=> @(posedge cdc.clk_b) ##[0:3] cdc.ack);
  // one tick too few: fails when no clk_b tick falls between req rising and the check
  a_slow : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            $rose(cdc.req) |=> @(posedge cdc.clk_b) ##[0:2] cdc.ack);
  // req stays set: still sampled 1 at the next clk_b tick (or the same one)
  a_held : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            cdc.req |-> @(posedge cdc.clk_b) cdc.req);
  // each part of an 'and' is checked on its own clock
  a_both : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            ($rose(cdc.req) |=> @(posedge cdc.clk_b) ##[0:3] cdc.ack) and (cdc.go |=> cdc.req));
  a_bad  : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            ($rose(cdc.req) |=> @(posedge cdc.clk_b) ##[0:3] cdc.ack) and (cdc.go |=> !cdc.req));
  // the switch in the antecedent: the consequent counts clk_b ticks
  a_sync : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            $rose(cdc.req) ##1 @(posedge cdc.clk_b) cdc.s1 |-> ##2 cdc.ack);
  a_soon : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n)
                            $rose(cdc.req) ##1 @(posedge cdc.clk_b) cdc.s1 |-> ##1 cdc.ack);
endmodule
bind cdc cdc_sva u ();
"""


def test_clock_switch_compiles_into_both_domains():
    prepared = prepare({"cdc.sv": DUT}, {"cdc_sva.sv": SVA})
    props = {p.label: p for p in prepared.properties}
    assert all(p.supported for p in props.values())
    assert prepared.multiclock
    # both clocks' ticks are seen on the global clock
    text = prepared.monitor_text
    assert "always @(posedge __va_gclk)" in text and "always @(posedge clk_a)" not in text



def test_a_switch_inside_a_consequent_sequence_is_reported():
    sva = SVA.replace("endmodule", "  a_mid : assert property (@(posedge cdc.clk_a) cdc.go |-> "
                                   "cdc.go ##1 @(posedge cdc.clk_b) cdc.ack);\nendmodule")
    props = {p.label: p for p in prepare({"cdc.sv": DUT}, {"cdc_sva.sv": sva}).properties}
    assert "supported only in an implication's antecedent" in props["a_mid"].problems[0]


@requires_sby
def test_clock_switch_verdicts(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="cdc.sv", mode="prove", depth=16, project_name="cdc")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_ack": "PROVEN", "a_slow": "FAIL", "a_held": "PROVEN", "a_both": "PROVEN",
                        "a_bad": "FAIL", "a_sync": "PROVEN", "a_soon": "FAIL"}


@requires_sby
def test_a_slower_synchroniser_is_caught(tmp_path, monkeypatch):
    # one more flop delays ack by a clk_b tick: the 4-tick window no longer holds
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    slow = DUT.replace("reg s1, s2;", "reg s1, s2, s3;").replace(
        "{s1, s2, ack} <= 3'b0; else {s1, s2, ack} <= {req, s1, s2};",
        "{s1, s2, s3, ack} <= 4'b0; else {s1, s2, s3, ack} <= {req, s1, s2, s3};")
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=slow, dut_filename="cdc.sv", mode="prove", depth=16, project_name="cdc3")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts["a_ack"] == "FAIL"


# clk2 is clk under another name: each clk tick is also a clk2 tick
SAME = """module same (input clk, input x, output reg q);
  wire clk2 = clk;
  always @(posedge clk) q <= x;
endmodule
"""
SAME_SVA = """module same_sva ();
  // |-> starts at the coincident clk2 tick: the same sample of x
  a_now   : assert property (@(posedge same.clk) same.x |-> @(posedge same.clk2) same.x);
  // |=> starts at the next clk2 tick, where q holds x
  a_next  : assert property (@(posedge same.clk) same.x |=> @(posedge same.clk2) same.q);
  a_wrong : assert property (@(posedge same.clk) same.x |=> @(posedge same.clk2) same.x);
  // ##0 joins at the coincident tick, ##1 at the next one
  a_fuse  : assert property (@(posedge same.clk) same.x ##0 @(posedge same.clk2) 1'b1 |-> same.x);
  a_join  : assert property (@(posedge same.clk) same.x ##1 @(posedge same.clk2) 1'b1 |-> same.x);
endmodule
bind same same_sva u ();
"""


@requires_sby
def test_overlapping_switch_starts_at_a_coincident_tick(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SAME_SVA, dut_code=SAME, dut_filename="same.sv", mode="prove", depth=12, project_name="same")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_now": "PROVEN", "a_next": "PROVEN", "a_wrong": "FAIL",
                        "a_fuse": "PROVEN", "a_join": "FAIL"}
