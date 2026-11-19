"""
Construct matrix (ADR-001 test strategy): one property per SVA construct on
a small design whose behaviour is known exactly, each with the verdict the
IEEE 1800 semantics require.  Runs the full slang pipeline with SymbiYosys.

Design: ack is req delayed by exactly two cycles, dout is din delayed by two
cycles, cnt is a free-running 3-bit counter; all registers clear in reset.
"""

import shutil
import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby, requires_yosys_slang

DUT = """
module pipe (input clk, input rst_n, input req, input [3:0] din,
             output reg ack, output reg [3:0] dout, output reg [2:0] cnt);
  reg       req_d;
  reg [3:0] din_d;
  always @(posedge clk) begin
    if (!rst_n) begin
      req_d <= 0; ack <= 0; din_d <= 0; dout <= 0; cnt <= 0;
    end else begin
      req_d <= req; ack <= req_d;
      din_d <= din; dout <= din_d;
      cnt <= cnt + 3'd1;
    end
  end
endmodule
"""

SVA = """
module pipe_sva ();
  default clocking @(posedge pipe.clk); endclocking
  default disable iff (!pipe.rst_n);

  // implication and delays
  a_delay2      : assert property (pipe.req |-> ##2 pipe.ack);
  a_delay2_nov  : assert property (pipe.req |=> ##1 pipe.ack);
  a_delay1      : assert property (pipe.req |-> ##1 pipe.ack);
  a_range       : assert property (pipe.req |-> ##[1:3] pipe.ack);
  a_seq_ante    : assert property (pipe.req ##1 pipe.req |-> ##1 pipe.ack ##1 pipe.ack);
  a_rep         : assert property (pipe.req [*3] |-> pipe.ack [*3]);
  a_rep_late    : assert property (pipe.req [*3] |=> ##1 pipe.ack [*3]);
  // sampled-value functions and internal signals
  a_rose        : assert property ($rose(pipe.req) |-> ##2 $rose(pipe.ack));
  a_past        : assert property (pipe.ack == $past(pipe.req, 2) || $past(!pipe.rst_n, 2));
  a_internal    : assert property (pipe.ack == $past(pipe.req_d) || $past(!pipe.rst_n));
  a_wrap        : assert property (pipe.cnt == 3'd7 |=> pipe.cnt == 3'd0);
  a_period      : assert property (pipe.cnt == 3'd0 |-> ##8 pipe.cnt == 3'd0);
  a_wrong_dir   : assert property (pipe.ack |-> ##2 pipe.req);
  // property operators
  a_not         : assert property (not (pipe.req ##2 !pipe.ack));
  a_and         : assert property ((pipe.req |-> ##2 pipe.ack) and (pipe.req |-> ##1 1));
  a_or          : assert property ((pipe.req |-> ##1 pipe.ack) or (pipe.req |-> ##2 pipe.ack));
  a_or_false    : assert property ((pipe.req |-> ##1 pipe.ack) or (pipe.req |-> ##3 pipe.ack));
  a_implies     : assert property (pipe.req implies (##2 pipe.ack));
  a_iff         : assert property (pipe.req iff (##2 pipe.ack));
  a_nexttime    : assert property (pipe.req |-> nexttime[2] pipe.ack);
  a_if          : assert property (if (pipe.req) ##2 pipe.ack else ##2 !pipe.ack);
  a_until       : assert property (pipe.cnt == 3'd1 |-> pipe.cnt != 3'd0 until pipe.cnt == 3'd7);
  a_followed    : assert property (pipe.req #=# ##1 pipe.ack);
  a_throughout  : assert property ((pipe.req throughout pipe.req [*3]) |=> ##1 pipe.ack);
  a_intersect   : assert property ((pipe.req ##2 pipe.ack) intersect (pipe.req ##1 1 ##1 pipe.ack)
                                   |-> pipe.ack);
  // local variable capture
  a_data        : assert property (p_data);
  // first_match and case
  a_first       : assert property (first_match(pipe.req ##[1:3] pipe.ack) |-> pipe.ack);
  a_first_bad   : assert property (first_match(pipe.req ##[1:3] pipe.ack) |=> pipe.ack);
  a_case        : assert property (case (pipe.cnt) 3'd0: ##1 pipe.cnt == 3'd1;
                                                   3'd6, 3'd7: ##1 pipe.cnt != 3'd1;
                                                   default: ##1 pipe.cnt != 3'd0; endcase);
  a_case_bad    : assert property (case (pipe.cnt) 3'd3: ##1 pipe.cnt == 3'd5; endcase);
  // vacuity and liveness
  a_vacuous     : assert property (pipe.cnt == 3'd7 && pipe.cnt == 3'd0 |-> pipe.ack);
  a_live        : assert property (pipe.req |-> s_eventually pipe.ack);
  // covers
  c_burst       : cover property (pipe.req ##1 pipe.req ##1 pipe.req);
  c_count5      : cover property (pipe.cnt == 3'd5);
  c_unreachable : cover property (pipe.ack && !$past(pipe.req_d));

  property p_data;
    logic [3:0] v;
    (pipe.req, v = pipe.din) |-> ##2 pipe.dout == v;
  endproperty
endmodule
bind pipe pipe_sva u_sva (.*);
"""

EXPECTED = {
    "a_delay2": "PROVEN", "a_delay2_nov": "PROVEN", "a_delay1": "FAIL",
    "a_range": "PROVEN", "a_seq_ante": "PROVEN", "a_rep": "PROVEN", "a_rep_late": "FAIL",
    "a_rose": "PROVEN", "a_past": "PROVEN", "a_internal": "PROVEN",
    "a_wrap": "PROVEN", "a_period": "PROVEN", "a_wrong_dir": "FAIL",
    "a_not": "PROVEN", "a_and": "PROVEN", "a_or": "PROVEN", "a_or_false": "FAIL",
    "a_implies": "PROVEN", "a_iff": "PROVEN", "a_nexttime": "PROVEN", "a_if": "PROVEN",
    "a_until": "PROVEN", "a_followed": "FAIL", "a_throughout": "PROVEN",
    "a_intersect": "PROVEN", "a_data": "PROVEN",
    "a_first": "PROVEN", "a_first_bad": "FAIL", "a_case": "PROVEN", "a_case_bad": "FAIL",
    "a_vacuous": "VACUOUS",
    # ack follows req after 2 cycles; the liveness part needs suprove
    "a_live": "PROVEN" if shutil.which("suprove") else "HOLDS_BOUNDED",
    "c_burst": "COVERED", "c_count5": "COVERED", "c_unreachable": "UNREACHABLE",
}


@requires_sby
def test_construct_matrix(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="pipe.sv", mode="prove", depth=16,
        timeout=300, project_name="matrix",
    )
    assert job.status == "complete", job.error_message
    assert job.result is not None and job.result.sanity["status"] == "OK"
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    mismatches = {k: (v, verdicts.get(k)) for k, v in EXPECTED.items() if verdicts.get(k) != v}
    assert not mismatches, f"expected vs got: {mismatches}"
    assert set(verdicts) == set(EXPECTED)


STRUCT_DUT = """
package bus_pkg;
  typedef enum logic [1:0] {Idle = 2'd0, Read = 2'd1, Write = 2'd2} op_e;
  typedef struct packed { logic [3:0] tag; logic flag; } user_t;
  typedef struct packed { logic valid; op_e op; logic [7:0] data; user_t user; } req_t;
endpackage

module bus_dev (input logic clk, input logic rst_n, input bus_pkg::req_t req_i,
                output logic [7:0] last_write, output logic [3:0] last_tag);
  always_ff @(posedge clk) begin
    if (!rst_n) begin
      last_write <= '0; last_tag <= '0;
    end else if (req_i.valid && req_i.op == bus_pkg::Write) begin
      last_write <= req_i.data; last_tag <= req_i.user.tag;
    end
  end
endmodule
"""

STRUCT_SVA = """
module bus_dev_props (input logic clk, input logic rst_n, input bus_pkg::req_t req_i,
                      input logic [7:0] last_write, input logic [3:0] last_tag);
  default clocking @(posedge clk); endclocking
  default disable iff (!rst_n);
  // members of a packed struct port, nested members, and package enum values in a property
  a_write:  assert property (req_i.valid && req_i.op == bus_pkg::Write |=> last_write == $past(req_i.data));
  a_tag:    assert property (req_i.valid && req_i.op inside {bus_pkg::Write} |=> last_tag == $past(req_i.user.tag));
  a_read:   assert property (req_i.valid && req_i.op inside {bus_pkg::Read, bus_pkg::Idle} |=> $stable(last_write));
  a_wrong:  assert property (req_i.valid && req_i.op == bus_pkg::Read |=> last_write == $past(req_i.data));
  c_flag:   cover property (req_i.valid && req_i.user.flag && req_i.op == bus_pkg::Write);
endmodule
bind bus_dev bus_dev_props u_props (.*);
"""


@requires_yosys_slang
def test_packed_struct_members_and_package_enums(tmp_path, monkeypatch):
    # an industrial bus port (OpenTitan's TL-UL is tlul_pkg::tl_h2d_t): a member is part of the bits
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=STRUCT_SVA, dut_code=STRUCT_DUT, dut_filename="bus_dev.sv", dut_top="bus_dev", mode="prove",
        depth=8, reset_signal="rst_n", reset_polarity="low", clock_signal="clk", project_name="structs")
    assert job.status == "complete", job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_write": "PROVEN", "a_tag": "PROVEN", "a_read": "PROVEN", "a_wrong": "FAIL",
                        "c_flag": "COVERED"}
