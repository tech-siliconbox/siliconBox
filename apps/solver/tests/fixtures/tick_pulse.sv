// Raises done one cycle after the third tick that follows start, counting ticks from the
// cycle after start. Original test fixture.
module tick_pulse (
    input  logic clk,
    input  logic rst_n,
    input  logic start,
    input  logic tick,
    output logic done
);
  logic       busy;
  logic [1:0] seen;
  always_ff @(posedge clk) begin
    if (!rst_n) begin
      busy <= 1'b0;
      seen <= 2'd0;
      done <= 1'b0;
    end else begin
      done <= 1'b0;
      if (busy && tick) begin
        if (seen == 2'd2) begin
          busy <= 1'b0;
          seen <= 2'd0;
          done <= 1'b1;
        end else begin
          seen <= seen + 2'd1;
        end
      end else if (start && !busy) begin
        busy <= 1'b1;
        seen <= 2'd0;
      end
    end
  end
endmodule
