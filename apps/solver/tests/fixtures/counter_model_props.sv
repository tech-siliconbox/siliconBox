// Properties with helper logic: a checker-side model of the counter. Original test fixture.
module counter_props (
    input logic       clk,
    input logic       rst_n,
    input logic       en,
    input logic [3:0] count
);
  // the expected value, modelled from the specification: count enable pulses, wrap after 9
  reg [3:0] f_expected;
  always @(posedge clk)
    if (!rst_n)  f_expected <= 4'd0;
    else if (en) f_expected <= (f_expected == 4'd9) ? 4'd0 : f_expected + 4'd1;

  property matches_model;
    (1 |-> (count == f_expected));
  endproperty: matches_model

  ap_matches_model : assert property(@(posedge clk) disable iff (!rst_n) matches_model);
endmodule
