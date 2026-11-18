// Properties for tick_pulse.sv. Original test fixture. The helper model keeps one start in
// flight at a time, as the design accepts start only when idle.
module tick_pulse_props (
    input logic clk,
    input logic rst_n,
    input logic start,
    input logic tick,
    input logic done
);
  reg       f_busy;
  reg [1:0] f_seen;
  always @(posedge clk) begin
    if (!rst_n) begin
      f_busy <= 1'b0;
      f_seen <= 2'd0;
    end else if (f_busy && tick) begin
      f_busy <= (f_seen != 2'd2);
      f_seen <= (f_seen == 2'd2) ? 2'd0 : f_seen + 2'd1;
    end else if (start && !f_busy) begin
      f_busy <= 1'b1;
    end
  end

  property one_at_a_time;
    (f_busy |-> !start);
  endproperty: one_at_a_time

  property done_after_third_tick;
    (start |=> tick[->3] ##1 done);
  endproperty: done_after_third_tick

  cp_one_at_a_time         : assume property(@(posedge clk) disable iff (!rst_n) one_at_a_time);
  ap_done_after_third_tick : assert property(@(posedge clk) disable iff (!rst_n) done_after_third_tick);
endmodule
