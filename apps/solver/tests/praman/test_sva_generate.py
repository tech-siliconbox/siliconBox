"""
Assertions inside generate blocks: a labelled assertion in a `for` generate
loop exists once per iteration and gets one property per iteration, named
after its generate path (g[2].a is labelled g_2__a).  An assertion in a
generate branch that is not taken is not part of the design and is not
reported.
"""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.pipeline import prepare_checked
from tests.praman.conftest import requires_sby

DUT = """module pick #(parameter N = 4) (input en, input [1:0] sel, input [4*N-1:0] din,
                                    output reg [3:0] dout);
  always @(*) dout = en ? din[sel*4 +: 4] : 4'd0;
endmodule
"""
SVA = """module pick_sva #(parameter N = 4) ();
  for (genvar i = 0; i < N; i++) begin : g_ast
    a_sel : assert property ((pick.en && pick.sel == i) |-> pick.dout == pick.din[i*4 +: 4]);
  end
  for (genvar i = 0; i < N; i++) begin : g_cov
    c_sel : cover property (pick.en && pick.sel == i && pick.dout != 0);
  end
  if (N < 4) begin : g_small
    c_never : cover property (pick.sel == 2'd3);
  end
  a_off : assert property (!pick.en |-> pick.dout == 0);
endmodule
bind pick pick_sva #(.N(N)) u (.*);
"""

PER_ITERATION = [f"g_ast_{i}__a_sel" for i in range(4)] + [f"g_cov_{i}__c_sel" for i in range(4)]


def test_each_iteration_gets_its_own_label():
    prepared = prepare_checked({"pick.sv": DUT}, {"pick_sva.sv": SVA})
    labels = [p.label for p in prepared.properties]
    assert sorted(labels) == sorted(PER_ITERATION + ["a_off"])
    assert all(p.supported for p in prepared.properties)
    # each label once in the monitor, so Yosys can read it
    for label in labels:
        assert prepared.monitor_text.count(f" {label}: ") == 1


@requires_sby
def test_generate_loop_properties_are_checked(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="pick.sv", mode="prove", depth=6,
        project_name="generate")
    assert job.result is not None, job.error_message
    verdicts = {r["name"]: r["verdict"] for r in job.result.assertion_results}
    assert verdicts == {
        **{f"g_ast_{i}__a_sel": "PROVEN" for i in range(4)},
        **{f"g_cov_{i}__c_sel": "COVERED" for i in range(4)},
        "a_off": "PROVEN",
    }
