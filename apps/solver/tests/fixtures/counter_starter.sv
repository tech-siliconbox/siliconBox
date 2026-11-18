// Starter for the invented counter Drill: one property that holds even on the buggy design.
// Original test fixture.
module counter_props (
    input logic       clk,
    input logic       rst_n,
    input logic       en,
    input logic [3:0] count
);
  property holds_when_idle;
    (!en |-> ##1 $stable(count));
  endproperty: holds_when_idle

  ap_holds_when_idle : assert property(@(posedge clk) disable iff (!rst_n) holds_when_idle);
endmodule
