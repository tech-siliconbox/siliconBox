// Properties for counter.sv. Original test fixture.
module counter_props (
    input logic       clk,
    input logic       rst_n,
    input logic       en,
    input logic [3:0] count
);
  property stays_in_range;
    (1 |-> (count <= 4'd9));
  endproperty: stays_in_range

  property holds_when_idle;
    (!en |-> ##1 $stable(count));
  endproperty: holds_when_idle

  property reaches_nine;
    (1 |-> (count == 4'd9));
  endproperty: reaches_nine

  ap_stays_in_range  : assert property(@(posedge clk) disable iff (!rst_n) stays_in_range);
  ap_holds_when_idle : assert property(@(posedge clk) disable iff (!rst_n) holds_when_idle);
  cp_reaches_nine    : cover property(@(posedge clk) disable iff (!rst_n) reaches_nine);
endmodule
