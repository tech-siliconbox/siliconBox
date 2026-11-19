"""run_formal_async returns at once; the job is finished in the background
and can be polled with get_job()."""

import asyncio
import time

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby

DUT = """module d (input clk, input rst_n, input a, output reg q);
  always @(posedge clk) if (!rst_n) q <= 0; else q <= a;
endmodule
"""
SVA = """module d_sva ();
  a_q : assert property (@(posedge d.clk) disable iff (!d.rst_n) d.a |=> d.q);
endmodule
bind d d_sva u (.*);
"""


@requires_sby
def test_run_formal_async_returns_before_the_job_finishes(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)

    async def scenario():
        job = await formal_service.run_formal_async(
            sva_code=SVA, dut_code=DUT, dut_filename="d.sv", mode="prove", depth=8,
            project_name="async_job")
        assert job.status == "queued"            # returned before any checking
        deadline = time.time() + 120
        while time.time() < deadline:
            polled = formal_service.get_job("async_job")
            if polled and polled.status in ("complete", "failed"):
                return polled
            await asyncio.sleep(0.2)
        raise AssertionError("job did not finish")

    done = asyncio.run(scenario())
    assert done.status == "complete", done.error_message
    assert done.result is not None
    assert {a["name"]: a["verdict"] for a in done.result.assertion_results} == {"a_q": "PROVEN"}
