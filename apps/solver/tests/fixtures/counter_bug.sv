// Seeded bug: the counter never wraps at 9, so it reaches 10 to 15. Original test fixture.
module counter (
    input  logic       clk,
    input  logic       rst_n,
    input  logic       en,
    output logic [3:0] count
);
  always_ff @(posedge clk) begin
    if (!rst_n) count <= 4'd0;
    else if (en) count <= count + 4'd1;
  end
endmodule
