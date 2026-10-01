// A decade counter: counts 0 to 9 while enabled, then wraps to 0. Original test fixture.
module counter (
    input  logic       clk,
    input  logic       rst_n,
    input  logic       en,
    output logic [3:0] count
);
  always_ff @(posedge clk) begin
    if (!rst_n) count <= 4'd0;
    else if (en) count <= (count == 4'd9) ? 4'd0 : count + 4'd1;
  end
endmodule
